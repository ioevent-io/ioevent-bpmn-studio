import * as vscode from 'vscode';
import axios from 'axios';

export class ApiService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly apiUrl: string
  ) { }

  private async createNewThread(): Promise<string> {
    try {
      const response = await axios.get(`${this.apiUrl}/openai/thread`, {
        headers: {
          Authorization: "Bearer token",
          userEmail: "userEmail@email.com",
        },
      });
      return response.data.threadId;
    } catch (error) {
      vscode.window.showErrorMessage("Failed to create new thread");
      throw error;
    }
  }



  public async sendPayload(
    payload: { threadId: string; message: string; xml?: string },
    options?: { signal?: AbortSignal }
  ): Promise<any> {
    try {


      const response = await axios.post(`${this.apiUrl}/openai/chat`, payload, {
        signal: options?.signal,
        timeout: 60000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
          'userEmail': 'userEmail@email.com'
        }
      });

      return response.data;
    } catch (error: any) {
      console.error('Full error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });

      const threadNotFound = error?.response?.data?.code === "THREAD_NOT_FOUND" ||
        error?.response?.status === 404;
      if (threadNotFound) {
        const newThreadId = await this.createNewThread();
        await this.context.globalState.update("bpmn-thread-id", newThreadId);
        return this.sendPayload({ ...payload, threadId: newThreadId });
      }
      throw error;
    }
  }
  public async resetThread(): Promise<void> {
    try {
      await this.context.globalState.update("bpmn-thread-id", undefined);
    } catch (error) {
      console.error("Failed to reset thread:", error);
      throw error;
    }
  }

  public async getOrCreateThreadId(): Promise<string> {
    let threadId = this.context.globalState.get<string>("bpmn-thread-id");
    if (!threadId) {
      threadId = await this.createNewThread();
      await this.context.globalState.update("bpmn-thread-id", threadId);
    }

    return threadId;
  }
}

