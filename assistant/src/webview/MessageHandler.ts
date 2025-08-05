import * as vscode from "vscode";
import { ApiService } from "../services/ApiService";
import { ChatStateManager } from "../services/ChatStateManager";
import { FileManager } from "../services/FileManager";
import { ChatMessage, ChatConversation } from "../interface/types";

interface WebviewMessage {
    type: string;
    [key: string]: any;
}

export class MessageHandler {
    private resumeTimer?: NodeJS.Timeout;
    private isRequestInProgress = false;
    private isRestoringState = false;
    private _view?: vscode.WebviewView;

    constructor(
        private readonly apiService: ApiService,
        private readonly stateManager: ChatStateManager,
        private readonly fileManager: FileManager
    ) { }

    public set view(view: vscode.WebviewView) {
        this._view = view;
    }

    public async handleMessage(message: WebviewMessage, webview: vscode.WebviewView): Promise<void> {
        try {
            switch (message.type) {
                case "sendMessage":
                    await this.stateManager.setBpmnContent(message.xml || null);
                    await this.handleSubmit(message.value, webview);
                    break;
                case "resetChat":
                    await this.resetChat(webview);
                    break;
                case "openUploadedFile":
                    await this.fileManager.handleOpenUploadedFile(message.content, message.fileName, webview);
                    break;
                case "webviewReady":
                    if (!this.isRestoringState) {
                        await this.restoreChatState(webview);
                    }
                    break;
                case "requestHistory":
                    await this.handleHistoryRequest(webview);
                    break;
                case "loadConversation":
                    await this.handleLoadConversation(message.threadId, webview);
                    break;
                case "deleteConversation":
                    await this.handleDeleteConversation(message.threadId, webview);
                    break;
                case "backToChat":
                    await webview.webview.postMessage({ type: "showChatView" });
                    break;
                default:
                    console.warn("Unknown message type:", message.type);
            }
        } catch (error) {
            console.error("Error processing message:", error);
            await webview.webview.postMessage({
                type: "error",
                message: `Failed to process ${message.type}: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    public async getConversationHistory(): Promise<ChatConversation[]> {
        try {
            const history = await this.stateManager.getChatHistory();
            return Array.isArray(history) ? history : [];
        } catch (error) {
            console.error("Error in getConversationHistory:", error);
            vscode.window.showWarningMessage("Failed to load conversation history.");
            return [];
        }
    }

    public async loadConversation(threadId: string, webview?: vscode.WebviewView): Promise<void> {
        const targetWebview = webview || this._view;
        if (!targetWebview) {
            console.warn("Cannot load conversation: webview not available");
            return;
        }

        if (!threadId) {
            console.warn("Cannot load conversation: threadId is empty");
            return;
        }

        try {
            const success = await this.stateManager.loadConversation(threadId);
            if (!success) {
                console.warn("Failed to load conversation:", threadId);
                vscode.window.showWarningMessage("Conversation could not be loaded");
                return;
            }

            const state = this.stateManager.getState();
            let filePath: string | null = null;
            let shouldOpenFile = false;

            if (state.currentBpmnContent && state.currentFileName) {
                filePath = await this.fileManager.handleBpmnFile(state.currentBpmnContent, state.currentFileName);
                shouldOpenFile = true;
            } else if (state.currentFileUri) {
                try {
                    filePath = vscode.Uri.parse(state.currentFileUri).fsPath;
                } catch (uriError) {
                    console.warn("Invalid URI in state:", state.currentFileUri, uriError);
                }
            }

            await targetWebview.webview.postMessage({
                type: "loadConversation",
                messages: state.messages,
                threadId: threadId,
                bpmnContent: state.currentBpmnContent,
                fileName: state.currentFileName,
                filePath: filePath
            });

            if (shouldOpenFile && filePath) {
                const fileUri = vscode.Uri.file(filePath);
                await this.fileManager.openWithBestEditor(fileUri);
            }

            if (state.currentBpmnContent) {
                await this.fileManager.handleBpmnDiagram(state.currentBpmnContent, targetWebview);
            }

        } catch (error) {
            console.error("Error loading conversation:", threadId, error);
            vscode.window.showErrorMessage(
                `Failed to load conversation: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    public async resetChat(webview?: vscode.WebviewView): Promise<void> {
        try {
            this.isRequestInProgress = false;
            if (this.resumeTimer) {
                clearTimeout(this.resumeTimer);
                this.resumeTimer = undefined;
            }

            await this.apiService.resetThread();
            await this.stateManager.resetChat();

            const targetWebview = webview || this._view;
            if (targetWebview) {
                await targetWebview.webview.postMessage({ type: "resetChat" });
            }

            vscode.window.showInformationMessage("New chat session ready");
        } catch (error) {
            console.error("Error resetting chat:", error);
            vscode.window.showErrorMessage("Failed to reset chat session");
        }
    }

    private async handleSubmit(message: string, webview: vscode.WebviewView): Promise<void> {
        if (!message.trim() || this.isRequestInProgress) return;

        try {
            const userMessage: ChatMessage = {
                role: "user",
                content: message,
                timestamp: Date.now(),
                id: this.stateManager.generateMessageId()
            };

            await this.stateManager.addMessage(userMessage);
            await this.stateManager.setSubmitting(true, message);
            this.isRequestInProgress = true;

            await this.addMessageToWebview(webview, "user", message);
            await this.addSpinnerToWebview(webview);

            await this.continueSubmission(message, webview);
        } catch (error) {
            console.error("Error handling submit:", error);
            await this.stateManager.setSubmitting(false);
            this.isRequestInProgress = false;
        }
    }

    private async continueSubmission(message: string, webview: vscode.WebviewView): Promise<void> {
        try {
            const state = this.stateManager.getState();
            let threadId = state.threadId;

            if (!threadId) {
                threadId = await this.apiService.getOrCreateThreadId();
                await this.stateManager.setThreadId(threadId);
            }

            const payload: any = { message, threadId };
            if (state.currentBpmnContent) {
                payload.xml = state.currentBpmnContent;
            }

            const response = await this.apiService.sendPayload(payload);

            if (response.threadId && response.threadId !== threadId) {
                await this.stateManager.setThreadId(response.threadId);
            }

            if (response.xml) {
                await this.fileManager.handleBpmnDiagram(response.xml, webview);

                if (response.isNew) {
                    await this.fileManager.saveXmlAndOpen(response.xml, response.processName);
                } else {
                    await this.stateManager.setBpmnContent(response.xml);
                    await this.fileManager.updateCurrentFile(response.xml);
                }
            }

            const assistantMessage: ChatMessage = {
                role: "assistant",
                content: response.message || JSON.stringify(response),
                timestamp: Date.now(),
                id: this.stateManager.generateMessageId()
            };

            await this.stateManager.addMessage(assistantMessage);
            await this.replaceSpinnerWithMessage(webview, assistantMessage.content);
            await this.stateManager.saveToHistory();

        } catch (error) {
            console.error("API Error:", error);

            const errorMessage: ChatMessage = {
                role: "error",
                content: "⚠️ An error occurred. Please try again.",
                timestamp: Date.now(),
                id: this.stateManager.generateMessageId()
            };

            await this.stateManager.addMessage(errorMessage);
            await this.stateManager.saveToHistory();
            await this.replaceSpinnerWithMessage(webview, errorMessage.content);

            vscode.window.showErrorMessage(`API request failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            await this.stateManager.setSubmitting(false);
            this.isRequestInProgress = false;
        }
    }

    private async handleHistoryRequest(webview: vscode.WebviewView): Promise<void> {
        try {
            const history = await this.stateManager.getChatHistory();

            if (history.length === 0) {
                const currentState = this.stateManager.getState();
                if (currentState.threadId && currentState.messages.length > 0) {
                    await this.stateManager.saveToHistory();
                    const updatedHistory = await this.stateManager.getChatHistory();
                    if (updatedHistory.length > 0) {
                        await this.sendHistoryToWebview(webview, updatedHistory);
                        return;
                    }
                }
                await webview.webview.postMessage({
                    type: "showHistory",
                    history: [],
                    isEmpty: true
                });
                return;
            }

            await this.sendHistoryToWebview(webview, history);
        } catch (error) {
            console.error("Failed to handle requestHistory:", error);
            await webview.webview.postMessage({
                type: "showHistory",
                history: [],
                error: "Failed to load conversation history"
            });
        }
    }

    private async sendHistoryToWebview(webview: vscode.WebviewView, history: ChatConversation[]): Promise<void> {
        const formattedHistory = history.map(conv => ({
            id: conv.threadId,
            title: conv.title || "Untitled conversation",
            timestamp: conv.lastMessageTimestamp || Date.now(),
            hasDiagram: !!conv.bpmnContent
        }));

        await webview.webview.postMessage({
            type: "showHistory",
            history: formattedHistory,
            isEmpty: false
        });
    }

    private async handleLoadConversation(threadId: string, webview: vscode.WebviewView): Promise<void> {
        await this.loadConversation(threadId, webview);
    }

    private async handleDeleteConversation(threadId: string, webview: vscode.WebviewView): Promise<void> {
        if (!threadId) {
            console.warn("deleteConversation called without threadId");
            return;
        }

        try {
            const deleted = await this.stateManager.deleteConversationFromHistory(threadId);
            if (!deleted) {
                console.warn("Conversation not found or could not be deleted");
                return;
            }

            const updatedHistory = await this.getConversationHistory();
            if (this._view) {
                const formattedHistory = updatedHistory.map(conv => ({
                    id: conv.threadId,
                    title: conv.title || "Untitled conversation",
                    timestamp: conv.lastMessageTimestamp || Date.now(),
                    hasDiagram: !!conv.bpmnContent
                }));

                await this._view.webview.postMessage({
                    type: "showHistory",
                    history: formattedHistory,
                    isEmpty: formattedHistory.length === 0
                });
            }
        } catch (error) {
            console.error("Error deleting conversation:", error);
            if (this._view) {
                await this._view.webview.postMessage({
                    type: "error",
                    message: "Failed to delete conversation"
                });
            }
        }
    }
    private async restoreChatState(webview: vscode.WebviewView): Promise<void> {
        if (this.isRestoringState) return;
        this.isRestoringState = true;

        try {
            await this.stateManager.cleanupExpiredRequests();
            const state = this.stateManager.getState();

            if (state.messages.length > 0) {
                await webview.webview.postMessage({
                    type: "restoreMessages",
                    messages: state.messages
                });
            }

            if (state.currentFileName) {
                await webview.webview.postMessage({
                    type: "updateFileDisplay",
                    fileName: state.currentFileName,
                    filePath: state.currentFileUri ? vscode.Uri.parse(state.currentFileUri).fsPath : null
                });
            }

            if (state.currentBpmnContent) {
                await this.fileManager.handleBpmnDiagram(state.currentBpmnContent, webview);
            }

            if (state.isSubmitting && state.pendingRequest && !this.stateManager.isPendingRequestExpired()) {
                await webview.webview.postMessage({
                    type: "showSpinner",
                    message: "Requête en cours..."
                });

                this.isRequestInProgress = true;
                this.resumeTimer = setTimeout(() => this.cleanupAbandonedRequest(webview), 30000);
            }
        } catch (error) {
            console.error("Error restoring chat state:", error);
        } finally {
            this.isRestoringState = false;
        }
    }

    private async cleanupAbandonedRequest(webview: vscode.WebviewView): Promise<void> {
        await this.stateManager.setSubmitting(false);
        this.isRequestInProgress = false;
        await webview.webview.postMessage({ type: "hideSpinner" });
    }

    private async addMessageToWebview(webview: vscode.WebviewView, role: "user" | "assistant" | "error", content: string): Promise<void> {
        await webview.webview.postMessage({
            type: "addMessage",
            value: { role, content },
        });
    }

    private async addSpinnerToWebview(webview: vscode.WebviewView): Promise<void> {
        await webview.webview.postMessage({
            type: "addMessage",
            value: {
                role: "assistant",
                content: "__SPINNER__",
            },
        });
    }

    private async replaceSpinnerWithMessage(webview: vscode.WebviewView, content: string): Promise<void> {
        await webview.webview.postMessage({
            type: "replaceSpinner",
            value: content,
        });
    }

    public onViewHidden(): void {
        if (this.resumeTimer) {
            clearTimeout(this.resumeTimer);
            this.resumeTimer = undefined;
        }
    }

    public dispose(): void {
        if (this.resumeTimer) {
            clearTimeout(this.resumeTimer);
        }
        this.isRequestInProgress = false;
        this.isRestoringState = false;
    }
}