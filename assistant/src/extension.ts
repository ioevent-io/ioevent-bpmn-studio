import * as vscode from "vscode";
import { ChatViewProvider } from "./providers/ChatViewProvider";

export function activate(context: vscode.ExtensionContext) {
    console.log("IOEvent extension activated");

    const provider = new ChatViewProvider(context.extensionUri, context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            ChatViewProvider.viewType,
            provider
        )
    );

    const addFileCommand = vscode.commands.registerCommand(
        "ioevent-studio.addFileToAssistant",
        async (uri: vscode.Uri) => {

            if (uri && uri.fsPath.endsWith(".bpmn")) {
                const viewShown = await provider.revealOrCreateView();
                if (!viewShown) {
                    vscode.window.showErrorMessage(
                        "Failed to display the assistant view"
                    );
                    return;
                }

                const success = await provider.sendFileToWebview(uri);
                if (success) {
                    vscode.window.showInformationMessage(
                        `BPMN file added to the assistant`
                    );

                } else {
                    vscode.window.showErrorMessage("Failed to add the BPMN file");
                }
            } else {
                vscode.window.showWarningMessage("This is not a valid BPMN file.");
            }
        }
    );

    context.subscriptions.push(addFileCommand);

}

export function deactivate() { }
