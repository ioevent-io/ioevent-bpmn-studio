import * as vscode from "vscode";
import { ChatStateManager } from "../services/ChatStateManager";

export class WebviewManager {
    private _view?: vscode.WebviewView;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly stateManager: ChatStateManager
    ) { }

    public async initialize(webviewView: vscode.WebviewView): Promise<void> {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri],
        };
        webviewView.webview.html = this.getHtmlContent(webviewView.webview);
    }

    public async revealOrCreateView(): Promise<boolean> {
        if (!this._view) {
            await vscode.commands.executeCommand(`assistantView.focus`);

            const viewReady = await new Promise<boolean>((resolve) => {
                const checkView = setInterval(() => {
                    if (this._view) {
                        clearInterval(checkView);
                        resolve(true);
                    }
                }, 100);
                setTimeout(() => {
                    clearInterval(checkView);
                    resolve(false);
                }, 2000);
            });

            if (!viewReady) return false;
        }

        if (this._view && !this._view.visible) {
            this._view.show(true);
        }
        return !!this._view;
    }

    public async postMessage(message: any): Promise<void> {
        await this._view?.webview.postMessage(message);
    }

    public async restoreChatState(): Promise<void> {
        if (!this._view) return;

        await this.stateManager.cleanupExpiredRequests();
        const state = this.stateManager.getState();

        if (state.messages.length > 0) {
            await this.postMessage({
                type: "restoreMessages",
                messages: state.messages
            });
        }

        if (state.currentFileName) {
            await this.postMessage({
                type: "updateFileDisplay",
                fileName: state.currentFileName,
                filePath: state.currentFileUri ? vscode.Uri.parse(state.currentFileUri).fsPath : null
            });
        }

        if (state.currentBpmnContent) {
            await this.postMessage({
                type: "updateBpmnDiagram",
                xml: state.currentBpmnContent
            });
        }
    }

    private getHtmlContent(webview: vscode.Webview): string {
        try {
            const scriptUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", "scripts", "main.js")
            );
            const lucideUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", "scripts", "lucide.min.js")
            );
            const mainCssUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", "styles", "main.css")
            );
            const chatCssUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", "styles", "chat.css")
            );
            const historyCssUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", "styles", "history.css")
            );
            const tailwindUri = webview.asWebviewUri(
                vscode.Uri.joinPath(this.extensionUri, "media", "styles", "tailwind.min.css")
            );
            const nonce = this.getNonce();

            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>IOEvent Assistant</title>
                <link href="${mainCssUri}" rel="stylesheet" />
                <link href="${chatCssUri}" rel="stylesheet" />
                <link href="${historyCssUri}" rel="stylesheet" />
                <link href="${tailwindUri}" rel="stylesheet" />
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">  
            </head>
            <body class="chat-body">
                <section class="chat-container">
                    <header class="chat-header">
                        <nav class="header-left" aria-label="Main navigation">
                        <button class="icon-button" id="new-chat-button" title="New Chat"><i data-lucide="plus"></i></button>
                        <button class="icon-button" id="history-button" title="History"><i data-lucide="history"></i></button>
                        </nav>
                    </header>
                
                    <main class="chat-messages" id="messages" role="log" aria-live="polite">
                        <div class="intro-message" id="intro-message">
                            <p><strong>Would you like to generate BPMN?</strong></p>
                            <p>You can easily create, share, and download BPMN diagrams with IOEvent.</p>
                        </div>
                    </main>
                
                    <footer class="chat-input" role="search">
                        <div class="file-upload-container">
                        <button class="add-file-button" id="add-file-button">
                            <i data-lucide="plus-circle"></i> Add File
                        </button>
                            
                            <div style="position: absolute; width: 0; height: 0; overflow: hidden;">
                            <input type="file" id="bpmn-upload" accept=".bpmn,.xml" />
                            </div>
                            
                            <div class="file-display-wrapper" style="display: none;" id="file-display">
                            <div class="file-display-content">
                                <i data-lucide="file-text" class="file-icon"></i>
                                <span class="file-name" id="displayed-filename"></span>
                                <button class="remove-file" title="Remove file">
                                    <i data-lucide="x"></i>
                                </button>
                            </div>
                            </div>
                        </div>
                    <div class="input-wrapper">
                    <textarea
                        id="message-input"
                        placeholder="Describe your Process ..."
                        aria-label="Message input"
                        rows="1"
                    ></textarea>
                    <button id="send-button" class="send-button" title="Send">
                        <i data-lucide="send" width="18" height="18"></i>
                    </button>
                </div>
                                    </footer>
                                </section>
                            <section id="history-container" class="hidden">
                    <div class="history-header">
                        <button class="back-button" id="back-to-chat">
                            <i data-lucide="arrow-left"></i> Back to Chat
                        </button>
                        <h2>Conversation History</h2>
                    </div>
                    <div id="history-list" class="history-list"></div>
                </section>
                            <script nonce="${nonce}" src="${lucideUri}"></script>
                            <script nonce="${nonce}" src="${scriptUri}"></script>
                            </body>
                            </html>`;
        } catch (error) {
            console.error("Error generating HTML content:", error);
            return `<html><body>Error loading content</body></html>`;
        }
    }

    private getNonce(): string {
        const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        return Array.from(
            { length: 32 },
            () => possible[Math.floor(Math.random() * possible.length)]
        ).join("");
    }

    public dispose(): void {
        this._view = undefined;
    }
}