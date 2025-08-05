import express from "express";
import OpenAI from "openai";
import { executeToolCall, optimizedPolling, checkThreadStatus, connectionPool } from "../utils/openaiUtils.js";

export const app = express();
const openai = new OpenAI(process.env.OPENAI_API_KEY);
let assistant_id = process.env.OPENAI_ASSISTANT_ID;

let token = "";
let userEmail = "";
let sessions = {};

app.get("/openai/thread", async (req, res) => {
    try {
        const threadResponse = await openai.beta.threads.create();
        sessions[threadResponse.id] = [];
        res.json({ threadId: threadResponse.id });
    } catch (error) {
        console.error("Error creating thread:", error);
        res
            .status(500)
            .json({ error: "An error occurred while creating the thread." });
    }
});

app.post("/openai/chat", async (req, res) => {
    const startTime = Date.now();
    let threadId, runId, connection;

    try {
        connection = connectionPool.acquire();
        if (!connection) {
            return res.status(429).json({ error: "Too many concurrent requests" });
        }

        const { message, xml } = req.body;
        threadId = req.body.threadId;
        console.log(xml);
        if (!message || !threadId) {
            return res.status(400).json({ error: "Message and threadId are required." });
        }

        const activeRunId = await checkThreadStatus(threadId);

        if (activeRunId) {
            try {
                await openai.beta.threads.runs.cancel(threadId, activeRunId);
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (cancelError) {
                console.warn("Failed to cancel active run:", cancelError);
            }
        }

        let jsonBPMN = null;
        if (xml?.trim().startsWith("<?xml")) {
            try {
                jsonBPMN = await extractElements(xml);
            } catch (err) {
                console.warn("Invalid XML:", err);
                return res.status(400).json({
                    error: "The provided XML is invalid.",
                    details: err.message || "XML parsing failed.",
                });
            }
        }

        const content = jsonBPMN
            ? `${message}\n\nJSON BPMN: ${JSON.stringify(jsonBPMN)}`
            : message;

        await openai.beta.threads.messages.create(threadId, {
            role: "user",
            content,
        });

        const runResponse = await openai.beta.threads.runs.create(threadId, {
            assistant_id,
            tool_choice: "auto",
        });

        runId = runResponse.id;
        console.log(`Run created: ${runId} (${Date.now() - startTime}ms)`);

        const MAX_CORRECTIONS = 1;
        let correctionAttempts = 0;
        let outputMessage = null;
        let firstOutputMessage = null;
        let firstAssistantMessage = null;

        while (true) {
            const run = await optimizedPolling(threadId, runId);

            if (run.status === "completed") break;

            if (run.status === "requires_action") {
                const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls;
                if (!toolCalls || toolCalls.length === 0) {
                    throw new Error("No tool calls found in requires_action");
                }

                const toolCall = toolCalls[0];

                try {
                    outputMessage = await executeToolCall(toolCall, token, userEmail, threadId, sessions);
                    outputMessage.isNew = JSON.parse(toolCall.function.arguments)?.isNew ?? false;
                    outputMessage.processName = JSON.parse(toolCall.function.arguments).processName;

                    if (!firstOutputMessage) firstOutputMessage = { ...outputMessage };

                    if (outputMessage.error) {
                        console.warn("BPMN Error detected:", outputMessage.details);

                        if (correctionAttempts >= MAX_CORRECTIONS) {
                            if (!firstAssistantMessage) {
                                const messages = await openai.beta.threads.messages.list(threadId, { limit: 10 });
                                firstAssistantMessage = messages.data.find(
                                    (msg) => msg.run_id === run.id && msg.role === "assistant"
                                );
                            }

                            return res.status(400).json({
                                error: "Persistent BPMN error. Automatic correction failed.",
                                details: outputMessage.details,
                                fallbackProcessName: firstOutputMessage?.processName,
                                fallbackMessage: firstAssistantMessage?.content?.[0]?.text?.value,
                            });
                        }

                        correctionAttempts++;

                        try {
                            await Promise.race([
                                openai.beta.threads.runs.cancel(threadId, run.id),
                                new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error("Cancel timeout")), 3000)
                                )
                            ]);
                        } catch (cancelErr) {
                            console.warn("Cancel failed during correction:", cancelErr);
                        }

                        let cancelRetries = 0;
                        while (cancelRetries < 15) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                            try {
                                const cancelledRun = await getCachedRunStatus(threadId, run.id);
                                if (!cancelledRun || !["cancelling", "queued", "in_progress"].includes(cancelledRun.status)) {
                                    break;
                                }
                            } catch (e) {
                                break;
                            }
                            cancelRetries++;
                        }

                        const correctionPrompt = `The submitted BPMN JSON contains the following errors:\n${JSON.stringify(
                            outputMessage.details,
                            null,
                            2
                        )}\nPlease automatically fix these errors and regenerate a valid BPMN.`;

                        await openai.beta.threads.messages.create(threadId, {
                            role: "user",
                            content: correctionPrompt,
                        });

                        const newRunResponse = await openai.beta.threads.runs.create(threadId, {
                            assistant_id,
                            tool_choice: "auto",
                        });

                        runId = newRunResponse.id;
                        continue;
                    }

                    await Promise.race([
                        openai.beta.threads.runs.submitToolOutputs(threadId, run.id, {
                            tool_outputs: [{
                                tool_call_id: toolCall.id,
                                output: JSON.stringify({ success: true }),
                            }],
                        }),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error("Submit timeout")), 8000)
                        )
                    ]);

                    if (!firstAssistantMessage) {
                        const messages = await openai.beta.threads.messages.list(threadId, { limit: 10 });
                        firstAssistantMessage = messages.data.find(
                            (msg) => msg.run_id === run.id && msg.role === "assistant"
                        );
                    }

                } catch (toolErr) {
                    console.error("Tool execution failed:", toolErr);
                    try {
                        await openai.beta.threads.runs.cancel(threadId, run.id);
                    } catch (cancelErr) {
                        console.warn("Cancel after tool error failed:", cancelErr);
                    }
                    throw toolErr;
                }
            }

            if (["failed", "cancelled", "expired"].includes(run.status)) {
                console.error(`Run failed with status: '${run.status}'`);
                return res.status(500).json({ error: `Run status: ${run.status}` });
            }
        }

        let assistantMessage;
        try {
            const messages = await Promise.race([
                openai.beta.threads.messages.list(threadId, { limit: 5 }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Messages timeout")), 4000)
                )
            ]);
            assistantMessage = messages.data.find(
                (msg) => msg.run_id === runId && msg.role === "assistant"
            );
        } catch (msgErr) {
            console.error("Message retrieval failed:", msgErr);
            return res.status(500).json({
                error: "Failed to retrieve assistant response",
                details: msgErr.message,
            });
        }

        const responseText = assistantMessage?.content?.[0]?.text?.value || "No response from assistant.";
        const totalTime = Date.now() - startTime;

        return res.json({
            xml: outputMessage?.xml,
            processName: outputMessage?.processName,
            isNew: outputMessage?.isNew,
            message: responseText,
            source: outputMessage?.xml ? "assistant_with_xml" : "assistant_text",
            performance: {
                totalTime,
                corrections: correctionAttempts,
                optimized: true
            }
        });

    } catch (error) {
        console.error("Global chat error:", error);

        if (runId && threadId) {
            try {
                await Promise.race([
                    openai.beta.threads.runs.cancel(threadId, runId),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Global cancel timeout")), 2000)
                    )
                ]);
            } catch (cancelErr) {
                console.warn("Global error cancel failed:", cancelErr);
            }
        }

        res.status(500).json({
            error: "Internal server error.",
            details: error.message || "Unknown error",
        });
    } finally {
        if (connection) {
            connectionPool.release(connection);
        }
    }
});

app.get("/openai/ping", (req, res) => {
    res.send(new Date());
});