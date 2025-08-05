(function () {
  const vscode = acquireVsCodeApi();
  let uploadedXml = null;
  window.currentFileName = null;
  window.currentFilePath = null;
  function init() {
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");
    const messagesContainer = document.getElementById("messages");
    const newChatButton = document.querySelector(
      ".icon-button[title='New Chat']"
    );
    const addFileButton = document.getElementById("add-file-button");
    const fileInput = document.getElementById("bpmn-upload");
    const fileDisplay = document.getElementById("file-display");
    const fileNameDisplay = document.getElementById("displayed-filename");
    const removeFileButton = document.querySelector(".remove-file");
    const historyButton = document.querySelector(".icon-button[title='History']");
    const backButton = document.querySelector(".back-button");
    const chatContainer = document.querySelector(".chat-container");
    const historyContainer = document.getElementById("history-container");
    const historyList = document.getElementById("history-list");

    if (historyButton && backButton && chatContainer && historyContainer && historyList) {
      historyButton.addEventListener("click", showHistoryView);
      backButton.addEventListener("click", showChatView);
    }

    if (
      !messageInput ||
      !sendButton ||
      !messagesContainer ||
      !newChatButton ||
      !addFileButton ||
      !fileInput ||
      !fileDisplay ||
      !fileNameDisplay ||
      !removeFileButton
    ) {
      console.error("Missing DOM elements");
      return;
    }

    if (window.lucide) {
      lucide.createIcons();
    }

    sendButton.disabled = messageInput.value.trim().length === 0;

    messageInput.addEventListener("input", () => {
      sendButton.disabled = messageInput.value.trim().length === 0;
    });

    addFileButton.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });

    fileInput.addEventListener("change", handleFileUpload);
    removeFileButton.addEventListener("click", handleFileRemoval);
    sendButton.addEventListener("click", sendMessage);

    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    newChatButton.addEventListener("click", () => {
      vscode.postMessage({ type: "resetChat" });
    });

    window.addEventListener("message", handleExtensionMessages);

    vscode.postMessage({ type: "webviewReady" });

    function showHistoryView() {
      vscode.postMessage({ type: "requestHistory" });
      chatContainer.style.display = "none";
      historyContainer.style.display = "block";
      historyList.innerHTML = ""; 
    }

    function showChatView() {
      chatContainer.style.display = "flex";
      historyContainer.style.display = "none";
    }

    function handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      fileNameDisplay.textContent = file.name;
      fileDisplay.style.display = "flex";

      const reader = new FileReader();
      reader.onload = (e) => {
        uploadedXml = e.target.result;
        console.log("XML file loaded:", file.name);
        vscode.postMessage({
          type: "openUploadedFile",
          content: e.target.result,
          fileName: file.name,
        });
      };

      reader.onerror = (e) => {
        console.error("File read error:", e.target.error);
        vscode.postMessage({
          type: "error",
          message: "Failed to read file: " + file.name
        });
      };

      reader.readAsText(file);

      if (window.lucide) {
        lucide.createIcons();
      }
    }

    function handleFileRemoval() {
      fileInput.value = "";
      fileDisplay.style.display = "none";
      uploadedXml = null;
      window.currentFileName = null;
      console.log("File removed");

      vscode.postMessage({
        type: "updateFileDisplay",
        fileName: null,
        filePath: null
      });
    }

    function updateFileDisplay(fileName, filePath) {
      const fileDisplay = document.getElementById("file-display");
      const fileNameElement = document.getElementById("displayed-filename");

      if (fileName) {
        fileDisplay.style.display = "flex";
        fileNameElement.textContent = fileName;
        window.currentFileName = fileName;
        window.currentFilePath = filePath;
      } else {
        fileDisplay.style.display = "none";
        window.currentFileName = null;
        window.currentFilePath = null;
      }

      if (window.lucide) {
        lucide.createIcons();
      }
    }

    function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      vscode.postMessage({
        type: "sendMessage",
        value: message,
        xml: uploadedXml || null,
        fileName: window.currentFileName || null,
      });

      messageInput.value = "";
      sendButton.disabled = true;
    }

    function resetInputFields() {
      messageInput.value = "";
      sendButton.disabled = true;
      fileInput.value = "";
      fileDisplay.style.display = "none";
      uploadedXml = null;
      window.currentFileName = null;
      window.currentFilePath = null;
    }

    function handleExtensionMessages(event) {
      const message = event.data;

      switch (message.type) {
        case "addMessage":
          addMessageToChat(message.value);
          break;
        case "replaceSpinner":
          replaceSpinnerMessage(message.value);
          break;
        case "resetChat":
          resetChatInterface();
          break;
        case "updateFileDisplay":
          updateFileDisplay(message.fileName, message.filePath);
          break;
        case "fileUploaded":
          handleFileUploaded(message);
          break;
        case "restoreMessages":
          restoreMessages(message.messages);
          showChatView(); 
          break;
          break;
        case "showSpinner":
          showSpinner(message.message);
          break;
        case "updateBpmnDiagram":
          console.log("BPMN diagram updated");
          break;
        case "showHistory":
          renderHistory(message.history);
          break;
        case "loadConversation":
          resetChatInterface();
          restoreMessages(message.messages);
          break;
        case "showChatView":
          showChatView();
          break;
        case "error":
          showError(message.message);
          break;
        default:
          console.warn("Unknown message type:", message.type);
      }
    }


    function renderHistory(history) {
  const historyList = document.getElementById("history-list");
  historyList.innerHTML = "";

  if (!history || history.length === 0) {
    historyList.innerHTML = `
      <div class="empty-history">
        <div class="empty-history-icon">
          <i data-lucide="clock" width="48" height="48"></i>
        </div>
        <h3>No conversation history</h3>
        <p>Your chat conversations will appear here once you start chatting.</p>
      </div>
    `;
    if (window.lucide) {
      lucide.createIcons();
    }
    return;
  }

  history.forEach(item => {
    const historyItem = document.createElement("div");
    historyItem.className = "history-item";
    
    const bpmnBadge = item.hasDiagram ? 
      `<span class="history-item-badge bpmn">
        <i data-lucide="workflow" width="12" height="12"></i>
        BPMN
      </span>` : '';
    
    historyItem.innerHTML = `
      <div class="history-item-content">
        <div class="history-item-header">
          <div class="history-item-title">${escapeHtml(item.title)}</div>
          <button class="history-item-delete" title="Delete conversation" data-thread-id="${item.id}">
            <i data-lucide="trash-2" width="14" height="14"></i>
          </button>
        </div>
        <div class="history-item-meta">
          <div class="history-item-date">${formatDate(item.timestamp)}</div>
          ${bpmnBadge}
        </div>
      </div>
    `;
    
    const deleteButton = historyItem.querySelector('.history-item-delete');
    deleteButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      await handleDeleteConversation(item.id, historyItem);
    });
    
    historyItem.addEventListener("click", (e) => {
      if (e.target.closest('.history-item-delete')) {
        return;
      }
      
      vscode.postMessage({
        type: "loadConversation",
        threadId: item.id
      });
      showChatView();
    });
    
    historyList.appendChild(historyItem);
  });

  if (window.lucide) {
    lucide.createIcons();
  }
}

async function handleDeleteConversation(threadId, historyItem) {
  try {
    historyItem.style.transform = 'translateX(-100%)';
    historyItem.style.opacity = '0';
    historyItem.style.transition = 'all 0.3s ease';
    
    vscode.postMessage({
      type: "deleteConversation",
      threadId: threadId
    });
    
    setTimeout(() => {
      historyItem.remove();
      checkEmptyHistory();
    }, 300);
    
  } catch (error) {
    console.error("Error handling delete:", error);
    historyItem.style.transform = '';
    historyItem.style.opacity = '';
  }
}

function checkEmptyHistory() {
  const historyList = document.getElementById("history-list");
  const remainingItems = historyList.querySelectorAll('.history-item');
  if (remainingItems.length === 0) {
    renderHistory([]);
  }
}
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = now - date;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const timeOptions = { hour: '2-digit', minute: '2-digit' };
    const dateOptions = { 
        month: 'short', 
        day: 'numeric', 
        year: diffDays > 365 ? 'numeric' : undefined 
    };

    if (diffDays === 0) {
        return `Today at ${date.toLocaleTimeString([], timeOptions)}`;
    } else if (diffDays === 1) {
        return `Yesterday at ${date.toLocaleTimeString([], timeOptions)}`;
    } else if (diffDays < 7) {
        return `${date.toLocaleDateString([], { weekday: 'short' })} at ${date.toLocaleTimeString([], timeOptions)}`;
    } else if (diffDays < 365) {
        return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${date.toLocaleTimeString([], timeOptions)}`;
    } else {
        return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${date.toLocaleTimeString([], timeOptions)}`;
    }
}
    function handleFileUploaded(message) {
      uploadedXml = message.content;

      updateFileDisplay(message.fileName, message.filePath);

      window.currentFileName = message.fileName;
      window.currentFilePath = message.filePath;

      console.log("File uploaded via context menu:", message.fileName);
    }
    function addMessageToChat(message) {
      const messageElement = document.createElement("div");
      messageElement.className = `message ${message.role}`;

      if (message.content === "__SPINNER__") {
        messageElement.innerHTML = `
          <div class="spinner-wrapper">
            <span class="spinner"></span>
            <span class="spinner-text">Generating...</span>
          </div>
        `;
        messageElement.classList.add("spinner-message");
      } else {
        messageElement.textContent = message.content;
      }

      if (message.role === "user") {
        const introMessage = document.querySelector(".intro-message");
        if (introMessage) {
          introMessage.remove();
        }
      }

      messagesContainer.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function replaceSpinnerMessage(content) {
      const spinner = messagesContainer.querySelector(
        ".message.assistant.spinner-message"
      );
      if (spinner) {
        spinner.classList.remove("spinner-message");
        spinner.textContent = content;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    function restoreMessages(messages) {
      const introMessage = document.querySelector(".intro-message");
      if (introMessage) {
        introMessage.remove();
      }

      messages.forEach(message => {
        const messageElement = document.createElement("div");
        messageElement.className = `message ${message.role}`;
        messageElement.textContent = message.content;
        messagesContainer.appendChild(messageElement);
      });

      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function showSpinner(message) {
      const spinnerMessage = {
        role: "assistant",
        content: "__SPINNER__"
      };
      addMessageToChat(spinnerMessage);
    }

    function showError(errorMessage) {
      const errorDiv = document.createElement("div");
      errorDiv.className = "message error";
      errorDiv.textContent = errorMessage;
      messagesContainer.appendChild(errorDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function resetChatInterface() {
      const messagesContainer = document.getElementById("messages");
      messagesContainer.innerHTML = `
        <div class="intro-message">
            <p><strong>Would you like to generate BPMN?</strong></p>
            <p>You can easily create, share, and download BPMN diagrams with IOEvent.</p>
        </div>
    `;
      resetInputFields();
    }
  }



  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();