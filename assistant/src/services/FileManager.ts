import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { ChatStateManager } from "./ChatStateManager";

export class FileManager {
    constructor(private readonly stateManager: ChatStateManager) {}

    public async sendFileToWebview(uri: vscode.Uri, webview: vscode.WebviewView): Promise<boolean> {
        try {
            const fileContent = await fs.readFile(uri.fsPath, "utf-8");
            const fileName = path.basename(uri.fsPath);
            await this.stateManager.setBpmnContent(fileContent, fileName, uri);

            await webview.webview.postMessage({
                type: "fileUploaded",
                content: fileContent,
                fileName: fileName,
                filePath: uri.fsPath
            });

            await vscode.commands.executeCommand("vscode.open", uri, {
                viewColumn: vscode.ViewColumn.Active,
                preview: false,
            });

            return true;
        } catch (error) {
            console.error("Error loading file:", error);
            vscode.window.showErrorMessage(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    public async handleOpenUploadedFile(content: string, fileName: string, webview: vscode.WebviewView): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let fileUri: vscode.Uri;

            if (workspaceFolders?.length) {
                const workspacePath = workspaceFolders[0].uri.fsPath;
                const filePath = path.join(workspacePath, fileName);
                fileUri = vscode.Uri.file(filePath);
            } else {
                const tempDir = path.join(os.tmpdir(), "vscode-uploads");
                await fs.mkdir(tempDir, { recursive: true });
                const filePath = path.join(tempDir, fileName);
                fileUri = vscode.Uri.file(filePath);
            }

            await fs.writeFile(fileUri.fsPath, content, "utf8");
            await this.stateManager.setBpmnContent(content, fileName, fileUri);
            await this.openWithBestEditor(fileUri);

            await webview.webview.postMessage({
                type: "updateFileDisplay",
                fileName: fileName,
                filePath: fileUri.fsPath,
            });
        } catch (error) {
            console.error("Error handling uploaded file:", error);
            vscode.window.showErrorMessage(`Failed to open uploaded file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async handleBpmnFile(bpmnContent: string, fileName: string): Promise<string | null> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            let filePath: string | null = null;

            if (workspaceFolders?.length) {
                const workspaceFilePath = path.join(workspaceFolders[0].uri.fsPath, fileName);

                try {
                    await fs.access(workspaceFilePath);
                    filePath = workspaceFilePath;
                    const workspaceFileUri = vscode.Uri.file(workspaceFilePath);
                    await this.stateManager.setBpmnContent(bpmnContent, fileName, workspaceFileUri);
                } catch {
                    await this.saveXmlAndOpen(bpmnContent, fileName);
                }
            } else {
                await this.saveXmlAndOpen(bpmnContent, fileName);
            }

            return filePath;
        } catch (error) {
            console.error("Error handling BPMN file:", error);
            return null;
        }
    }

    public async saveXmlAndOpen(xmlContent: string, processName: string): Promise<void> {
        try {
            let fileUri: vscode.Uri | undefined;
            const workspaceFolders = vscode.workspace.workspaceFolders;

            const cleanProcessName = processName
                .replace(/[^a-zA-Z0-9-_]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 50);

            const fileName = `${cleanProcessName}.bpmn`;

            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspacePath = workspaceFolders[0].uri.fsPath;
                const filePath = path.join(workspacePath, fileName);
                fileUri = vscode.Uri.file(filePath);
            } else {
                fileUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(fileName),
                    filters: { BPMN: ["bpmn"], XML: ["xml"] },
                    saveLabel: "Save BPMN file",
                });

                if (!fileUri) {
                    vscode.window.showWarningMessage("File save canceled.");
                    return;
                }
            }

            await fs.writeFile(fileUri.fsPath, xmlContent, "utf8");
            await this.stateManager.setBpmnContent(xmlContent, fileName, fileUri);
            await this.openWithBestEditor(fileUri);
        } catch (error) {
            console.error("Error saving XML:", error);
            vscode.window.showErrorMessage(`Failed to save or open BPMN file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async updateCurrentFile(xmlContent: string): Promise<void> {
        const currentFileUri = this.stateManager.getCurrentFileUri();
        if (!currentFileUri) return;

        try {
            await fs.writeFile(currentFileUri.fsPath, xmlContent, "utf8");
            await this.closeAllEditorsForFile(currentFileUri); 
            await this.openWithBestEditor(currentFileUri);
            await this.stateManager.setBpmnContent(xmlContent);
        } catch (error) {
            console.error("Error updating file:", error);
            vscode.window.showErrorMessage(`Failed to update file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async handleBpmnDiagram(xmlContent: string, webview: vscode.WebviewView): Promise<void> {
        await webview.webview.postMessage({
            type: "updateBpmnDiagram",
            xml: xmlContent,
        });
    }

    private async closeAllEditorsForFile(uri: vscode.Uri): Promise<void> {
        try {
            const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs);
            const tabsToClose = tabs.filter((tab) => {
                const tabUri = this.getUriFromTab(tab);
                return tabUri?.toString() === uri.toString();
            });

            for (const tab of tabsToClose) {
                await vscode.window.tabGroups.close(tab);
            }
        } catch (error) {
            console.error("Error closing editors:", error);
        }
    }

    private getUriFromTab(tab: vscode.Tab): vscode.Uri | null {
        try {
            if (tab.input instanceof vscode.TabInputText) return tab.input.uri;
            if (tab.input instanceof vscode.TabInputCustom) return tab.input.uri;
            return null;
        } catch (error) {
            console.error("Error getting URI from tab:", error);
            return null;
        }
    }

    public async openWithBestEditor(uri: vscode.Uri): Promise<void> {
        try {
            try {
                await vscode.commands.executeCommand("vscode.openWith", uri, "bpmn-io.bpmnEditor");
                return;
            } catch (bpmnError) {
                console.warn("Failed to open with BPMN editor:", bpmnError);
            }

            await vscode.commands.executeCommand("vscode.open", uri);
        } catch (error) {
            console.error("Error opening file:", error);
            throw error;
        }
    }
}