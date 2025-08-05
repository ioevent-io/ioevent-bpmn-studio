import * as vscode from "vscode";
import { ApiService } from "../services/ApiService";
import { ChatStateManager } from "../services/ChatStateManager";
import { WebviewManager } from "../webview/WebviewManager";
import { FileManager } from "../services/FileManager";
import { MessageHandler } from "../webview/MessageHandler";
import { ChatConversation } from "../interface/types";

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "assistantView";

    private _view?: vscode.WebviewView;
    private webviewManager: WebviewManager;
    private fileManager: FileManager;
    private messageHandler: MessageHandler;
    private disposables: vscode.Disposable[] = [];
    private isInitialized = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly context: vscode.ExtensionContext
    ) {
        const apiUrl = this.getConfiguredApiUrl(context);
        const apiService = new ApiService(context, apiUrl);
        const stateManager = ChatStateManager.getInstance(context);
        
        this.webviewManager = new WebviewManager(_extensionUri, stateManager);
        this.fileManager = new FileManager(stateManager);
        this.messageHandler = new MessageHandler(apiService, stateManager, this.fileManager);
        
        this.checkBpmnEditorAvailability();
    }

    public async resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        await this.webviewManager.initialize(webviewView);
        
        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) this.onViewBecameVisible();
                else this.onViewBecameHidden();
            }),
            webviewView.webview.onDidReceiveMessage(async (message) => {
                await this.messageHandler.handleMessage(message, this._view!);
            })
        );
        
        this.isInitialized = true;
    }

    public async revealOrCreateView(): Promise<boolean> {
        return this.webviewManager.revealOrCreateView();
    }

    public async getConversationHistory(): Promise<ChatConversation[]> {
        return this.messageHandler.getConversationHistory();
    }

    public async loadConversation(threadId: string): Promise<void> {
        if (!this._view) return;
        await this.messageHandler.loadConversation(threadId, this._view);
    }

    public async sendFileToWebview(uri: vscode.Uri): Promise<boolean> {
        const viewReady = await this.revealOrCreateView();
        if (!viewReady || !this._view) return false;
        
        return this.fileManager.sendFileToWebview(uri, this._view);
    }

    public async resetChat(): Promise<void> {
        await this.messageHandler.resetChat(this._view);
    }

    private getConfiguredApiUrl(context: vscode.ExtensionContext): string {
        const config = vscode.workspace.getConfiguration("ioeventstudio");
        return config.get<string>("apiUrl", "http://localhost:52004"
        );
    }

    private async checkBpmnEditorAvailability(forceShow: boolean = false): Promise<void> {
        const bpmnIoExtension = vscode.extensions.getExtension('bpmn-io.vs-code-bpmn-io');
        const redhatExtension = vscode.extensions.getExtension('redhat.vscode-extension-bpmn-editor');

        if (forceShow || (!bpmnIoExtension && !redhatExtension)) {
            if (!vscode.window.state.focused) {
                await new Promise(resolve => {
                    const disposable = vscode.window.onDidChangeWindowState(state => {
                        if (state.focused) {
                            disposable.dispose();
                            resolve(null);
                        }
                    });
                });
            }
            
            const options = [
                'Later',
                'BPMN Editor by Red Hat',
                'BPMN Editor by bpmn-io',
            ];
            
            const choice = await vscode.window.showWarningMessage(
                'To improve your experience with BPMN diagrams.\nWe strongly recommend installing a dedicated BPMN editor extension.',
                { modal: true },
                ...options
            );

            switch (choice) {
                case 'BPMN Editor by bpmn-io':
                    try {
                        await vscode.commands.executeCommand(
                            'workbench.extensions.installExtension',
                            'bpmn-io.vs-code-bpmn-io'
                        );
                        vscode.window.showInformationMessage('Installation of BPMN Editor by bpmn-io has started!');
                    } catch (error) {
                        console.error('Installation error:', error);
                        vscode.window.showErrorMessage('Failed to install BPMN Editor by bpmn-io');
                    }
                    break;

                case 'BPMN Editor by Red Hat':
                    try {
                        await vscode.commands.executeCommand(
                            'workbench.extensions.installExtension',
                            'redhat.vscode-extension-bpmn-editor'
                        );
                        vscode.window.showInformationMessage('Installation of BPMN Editor by Red Hat has started!');
                    } catch (error) {
                        console.error('Installation error:', error);
                        vscode.window.showErrorMessage('Failed to install BPMN Editor by Red Hat');
                    }
                    break;

                case 'Later':
                    break;

                default:
                    break;
            }
        }
    }

    private onViewBecameVisible(): void {
        console.log("Chat view became visible");
    }

    private onViewBecameHidden(): void {
        this.messageHandler.onViewHidden();
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.webviewManager.dispose();
        this.messageHandler.dispose();
    }
}