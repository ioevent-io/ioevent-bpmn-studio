import OpenAI from "openai";
const openai = new OpenAI(process.env.OPENAI_API_KEY);

export const runStatusCache = new Map();
export const CACHE_TTL = 200;

export const connectionPool = {
    activeConnections: new Set(),
    maxConnections: 15,
    acquire() {
        if (this.activeConnections.size >= this.maxConnections) {
            return null;
        }
        const conn = Symbol('connection');
        this.activeConnections.add(conn);
        return conn;
    },
    release(conn) {
        this.activeConnections.delete(conn);
    }
};

export async function getCachedRunStatus(threadId, runId) {
    const cacheKey = `${threadId}-${runId}`;
    const cached = runStatusCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.status;
    }

    try {
        const run = await openai.beta.threads.runs.retrieve(threadId, runId);
        runStatusCache.set(cacheKey, {
            status: run,
            timestamp: Date.now()
        });

        if (runStatusCache.size > 100) {
            const oldest = Array.from(runStatusCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
                .slice(0, 50);
            oldest.forEach(([key]) => runStatusCache.delete(key));
        }

        return run;
    } catch (error) {
        return cached?.status || null;
    }
}

export async function optimizedPolling(threadId, runId, maxRetries = 80) {
    let retries = 0;
    let delay = 2000;
    const maxDelay = 1000;
    const backoffMultiplier = 1.3;

    while (retries < maxRetries) {
        try {
            const run = await getCachedRunStatus(threadId, runId);
            if (!run) throw new Error("Failed to retrieve run status");

            if (["completed", "failed", "cancelled", "expired"].includes(run.status)) {
                return run;
            }

            if (run.status === "requires_action") {
                return run;
            }

            if (run.status === "in_progress") {
                delay = Math.max(delay * 0.9, 30);
            } else if (run.status === "queued") {
                delay = Math.min(delay * backoffMultiplier, maxDelay);
            }

            await new Promise(resolve => setTimeout(resolve, delay));

        } catch (error) {
            console.warn(`Polling error (retry ${retries}):`, error.message);
            delay = Math.min(delay * 1.5, maxDelay);
        }

        retries++;
    }

    throw new Error(`Polling timeout after ${maxRetries} attempts`);
}

export async function executeToolCall(toolCall, token, userEmail, threadId, sessions) {
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    if (typeof global[functionName] !== "function") {
        throw new Error(`Function ${functionName} not available`);
    }

    const maxAttempts = 2;
    let attempt = 0;

    while (attempt < maxAttempts) {
        try {
            const timeout = functionName.includes('bpmn') ? 25000 : 15000;

            const output = await Promise.race([
                global[functionName](args, token, userEmail, threadId, sessions),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Function timeout after ${timeout}ms`)), timeout)
                )
            ]);

            return JSON.parse(output);

        } catch (error) {
            attempt++;
            if (attempt >= maxAttempts) throw error;

            console.warn(`Tool call attempt ${attempt} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 200 * attempt));
        }
    }
}

export async function checkThreadStatus(threadId) {
    try {
        const runs = await openai.beta.threads.runs.list(threadId, { limit: 1 });
        const activeRun = runs.data.find(run =>
            ['queued', 'in_progress', 'requires_action'].includes(run.status)
        );
        return activeRun ? activeRun.id : null;
    } catch (error) {
        console.error("Error checking thread status:", error);
        return null;
    }
}