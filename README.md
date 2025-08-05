# IOEvent BPMN Studio – Extension for VS Code

The BPMN Generator Extension is an intelligent assistant for Visual Studio Code that helps you create BPMN diagrams from natural language descriptions. It combines AI-powered process understanding with seamless VS Code integration.

## Key Features

- **AI-Powered BPMN Generation**: Convert text descriptions into complete BPMN diagrams
- **Integrated Chat Interface**: Interactive conversation directly in VS Code
- **File Management**: Save, open, and edit BPMN files within your workspace
- **History Tracking**: Maintain conversation history and previous diagrams
- **Multi-Editor Support**: Works with popular BPMN editors (bpmn-io and Red Hat)


## System Architecture

### Frontend (VS Code Extension)
- Built with TypeScript and VS Code Webview API
- Provides the chat interface and diagram preview
- Manages file operations and editor integration

### Backend Service
- Node.js/Express.js API server
- Processes natural language using AI (OpenAI)
- Generates valid BPMN 2.0 XML
- Maintains conversation context

### BPMN Visualization
- Supports both bpmn-io and Red Hat BPMN editors
- Real-time diagram updates


## Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/ioevent-io/ioevent_generator.git
```

### 2. Set up the backend

```bash
cd backend
npm install
npm start
```

### 3. Install and run the extension

```bash
cd assistant
npm install
```
- Open the folder in VS Code
- Press F5 to launch in debug mode

### 4. Usage Guide

- Open the BPMN Assistant view from the activity bar
- Describe your process in natural language
- The extension will:
  - Generate a BPMN diagram
  - Save it to your workspace
  - Open it in your preferred BPMN editor
  - Continue refining through conversation