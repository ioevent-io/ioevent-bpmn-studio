import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ChatConversation, ChatMessage, ChatState } from "../interface/types";


async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export class ChatStateManager {
    private static instance: ChatStateManager;
    private context: vscode.ExtensionContext;
    private currentState: ChatState;
    private stateKey = "ioevent.chatState";
    private historyKey = "ioevent.chatHistory";

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.currentState = this.loadState();
    }

    public static getInstance(context: vscode.ExtensionContext): ChatStateManager {
        if (!ChatStateManager.instance) {
            ChatStateManager.instance = new ChatStateManager(context);
        }
        return ChatStateManager.instance;
    }

    private loadState(): ChatState {
        const savedState = this.context.globalState.get<ChatState>(this.stateKey);

        if (!savedState || !Array.isArray(savedState.messages)) {
            return {
                messages: [],
                currentBpmnContent: null,
                currentFileName: null,
                currentFileUri: null,
                isSubmitting: false,
                pendingRequest: null,
                threadId: null
            };
        }

        return savedState;
    }


    private async saveState(): Promise<void> {
        try {
            await this.context.globalState.update(this.stateKey, this.currentState);
        } catch (error) {
            console.error("Failed to save chat state:", error);
        }
    }

    public getState(): ChatState {
        return { ...this.currentState };
    }

    public async addMessage(message: ChatMessage): Promise<void> {
        this.currentState.messages.push(message);
        await this.saveState();
        if (this.currentState.threadId) {
            await this.saveCurrentConversationToHistory();
        }
    }

    public async persistConversation(): Promise<void> {
        if (this.currentState.threadId && this.currentState.messages.length > 0) {
            await this.saveCurrentConversationToHistory();
        }
    }
    public async updateLastMessage(content: string): Promise<void> {
        const lastMessage = this.currentState.messages[this.currentState.messages.length - 1];
        if (lastMessage && lastMessage.role === "assistant") {
            lastMessage.content = content;
            await this.saveState();
            if (this.currentState.threadId) {
                await this.saveCurrentConversationToHistory();
            }
        }
    }

    public async setSubmitting(isSubmitting: boolean, pendingMessage?: string): Promise<void> {
        this.currentState.isSubmitting = isSubmitting;
        if (isSubmitting && pendingMessage) {
            this.currentState.pendingRequest = {
                message: pendingMessage,
                timestamp: Date.now()
            };
        } else {
            this.currentState.pendingRequest = null;
        }
        await this.saveState();
    }

    public async setBpmnContent(content: string | null, fileName?: string | null, fileUri?: vscode.Uri | null): Promise<void> {
        this.currentState.currentBpmnContent = content;
        if (fileName !== undefined) {
            this.currentState.currentFileName = fileName;
        }
        if (fileUri !== undefined) {
            this.currentState.currentFileUri = fileUri?.toString() || null;
        }
        await this.saveState();
        if (this.currentState.threadId) {
            await this.saveCurrentConversationToHistory();
        }
    }

    public async setThreadId(threadId: string | null): Promise<void> {
        this.currentState.threadId = threadId;
        await this.saveState();
        if (threadId && this.currentState.messages.length > 0) {
            await this.saveCurrentConversationToHistory();
        }
    }


    public getCurrentFileUri(): vscode.Uri | null {
        return this.currentState.currentFileUri ?
            vscode.Uri.parse(this.currentState.currentFileUri) : null;
    }

    public generateMessageId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    public isPendingRequestExpired(maxAgeMs: number = 5 * 60 * 1000): boolean {
        if (!this.currentState.pendingRequest) return false;
        return Date.now() - this.currentState.pendingRequest.timestamp > maxAgeMs;
    }

    public async cleanupExpiredRequests(): Promise<void> {
        if (this.isPendingRequestExpired()) {
            this.currentState.isSubmitting = false;
            this.currentState.pendingRequest = null;
            await this.saveState();
        }
    }


    private async saveCurrentConversationToHistory(): Promise<void> {
        if (!this.currentState.threadId || this.currentState.messages.length === 0) {
            return;
        }

        try {
            const history = await this.getChatHistory();
            const title = this.generateConversationTitle();
            const lastMessageTimestamp = Math.max(...this.currentState.messages.map(m => m.timestamp));

            const conversation: ChatConversation = {
                threadId: this.currentState.threadId,
                title,
                lastMessageTimestamp,
                messages: [...this.currentState.messages],
                bpmnContent: this.currentState.currentBpmnContent,
                fileName: this.currentState.currentFileName,
                fileUri: this.currentState.currentFileUri

            };

            const existingIndex = history.findIndex(c => c.threadId === this.currentState.threadId);
            if (existingIndex >= 0) {
                history[existingIndex] = conversation;
            } else {
                history.push(conversation);
            }

            history.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
            const limitedHistory = history.slice(0, 50);

            await this.context.globalState.update(this.historyKey, limitedHistory);

        } catch (error) {
            console.error("Failed to save conversation to history:", error);
        }
    }





    public async deleteConversationFromHistory(threadId: string): Promise<boolean> {
        try {
            const history = await this.getChatHistory();
            const filteredHistory = history.filter(c => c.threadId !== threadId);

            if (filteredHistory.length !== history.length) {
                await this.context.globalState.update(this.historyKey, filteredHistory);
                return true;
            }
            return false;
        } catch (error) {
            console.error("Failed to delete conversation from history:", error);
            return false;
        }
    }

    public async clearChatHistory(): Promise<void> {
        try {
            await this.context.globalState.update(this.historyKey, []);
        } catch (error) {
            console.error("Failed to clear chat history:", error);
        }
    }

    public async getChatHistory(): Promise<ChatConversation[]> {
        try {
            const history = this.context.globalState.get<ChatConversation[]>(this.historyKey);
            if (!Array.isArray(history)) {
                return [];
            }
            return history.filter(conv =>
                conv.threadId &&
                Array.isArray(conv.messages) &&
                conv.messages.length > 0
            );
        } catch (error) {
            console.error("Failed to load chat history:", error);
            return [];
        }
    }



    public async loadConversation(threadId: string): Promise<boolean> {
        const history = await this.getChatHistory();
        const conversation = history.find(c => c.threadId === threadId);
        if (!conversation) {
            return false;
        }
        await this.persistConversation();
        let fileUri = null;
        if (conversation.fileName) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders?.length) {
                const filePath = path.join(workspaceFolders[0].uri.fsPath, conversation.fileName);
                if (await fileExists(filePath)) {
                    fileUri = vscode.Uri.file(filePath).toString();
                }
            }
        }

        this.currentState = {
            messages: [...conversation.messages],
            currentBpmnContent: conversation.bpmnContent || null,
            currentFileName: conversation.fileName || null,
            currentFileUri: fileUri,
            isSubmitting: false,
            pendingRequest: null,
            threadId: conversation.threadId
        };
        return true;
    }



    public async saveToHistory(): Promise<void> {
        if (this.currentState.threadId && this.currentState.messages.length > 0) {
            await this.saveCurrentConversationToHistory();
            const history = await this.getChatHistory();
            const found = history.find(c => c.threadId === this.currentState.threadId);
            if (found) {
                console.log("Conversation details:", found.title, found.messages.length, "messages");
            }
        } else {
            console.log("Cannot force save: no threadId or no messages");
            console.log("Current state:", {
                threadId: this.currentState.threadId,
                messageCount: this.currentState.messages.length
            });
        }
    }

    private generateConversationTitle(): string {
        const userMessages = this.currentState.messages.filter(m => m.role === "user");
        if (userMessages.length === 0) {
            return "New conversation";
        }
        const firstUserMessage = userMessages[0].content;
        return firstUserMessage.length > 50
            ? firstUserMessage.substring(0, 50) + "..."
            : firstUserMessage;
    }

    public async resetChat(): Promise<void> {
        if (this.currentState.threadId && this.currentState.messages.length > 0) {
            await this.saveCurrentConversationToHistory();
        }
        this.currentState = {
            messages: [],
            currentBpmnContent: null,
            currentFileName: null,
            currentFileUri: null,
            isSubmitting: false,
            pendingRequest: null,
            threadId: null
        };
        await this.saveState();
    }
}