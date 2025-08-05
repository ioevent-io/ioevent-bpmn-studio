export interface ChatMessage {
    role: "user" | "assistant" | "error";
    content: string;
    timestamp: number;
    id: string;
}

export interface ChatConversation {
    threadId: string;
    title: string;
    lastMessageTimestamp: number;
    messages: ChatMessage[];
    bpmnContent?: string | null;
    fileName?: string | null;
    fileUri?: string | null;
}

export interface ChatState {
    messages: ChatMessage[];
    currentBpmnContent: string | null;
    currentFileName: string | null;
    currentFileUri: string | null;
    isSubmitting: boolean;
    pendingRequest: {
        message: string;
        timestamp: number;
    } | null;
    threadId: string | null;
}
