
# IOEvent BPMN Studio
<p align="left">
  <a href="https://github.com/ioevent-io" title="GitHub" style="outline:none;">
    <img src="https://img.shields.io/badge/GitHub-181717?logo=github&logoColor=white&style=flat" alt="GitHub">
  </a>
  &nbsp;&nbsp;
  <a href="mailto:contact@ioevent.io" title="Contact" style="outline:none;">
    <img src="https://img.shields.io/badge/Contact-D14836?logo=gmail&logoColor=white&style=flat" alt="Contact">
  </a>
  &nbsp;&nbsp;
  <a href="#" style="outline:none;">
    <img src="https://img.shields.io/badge/Version-0.1.3--alpha-007ACC?logo=visual-studio-code&logoColor=white&style=flat" alt="Version 0.1.3-alpha">
  </a>
</p>



## About IOEvent

[**IOEvent**](https://www.ioevent.io/) is a highly scalable event-driven microservices framework. It provides a flexible programming model to power your Event Driven Architecture (EDA), offering BPMN 2.0 support and an observability platform to monitor and secure your entire production.

-  Java Annotation-based built on Spring Boot 2.x 
-  No database required
-  Seamless integration with Kafka and Kafka Streams 
-  Fanout and parallel processing
-  BPMN 2.0 Production Observability
-  Out-Of-The-Box Real time Dashboards


![](https://github.com/ioevent-io/io-ioevent-samples/blob/feat/bpmn-studio/docs/images/architecture.png?raw=true)


## About the Extension

**IOEvent BPMN Studio** is an intelligent Visual Studio Code extension powered by AI that simplifies the creation, editing, optimization, and management of BPMN diagrams. This extension allows users to transition quickly from functional descriptions to visual models while maintaining full control over the editing of diagrams.

![](https://github.com/ioevent-io/io-ioevent-samples/blob/feat/bpmn-studio/docs/images/demo.gif?raw=true)

## Requirement

To properly visualize BPMN diagrams, you must install a BPMN-compatible viewer or editor in your workspace.
We recommend the following extensions for the best experience:

- [BPMN Editor by bpmn-io](https://marketplace.visualstudio.com/items?itemName=bpmn-io.vs-code-bpmn-io)
- [BPMN Editor by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-extension-bpmn-editor)
- Or any other BPMN-compatible extension of your choice.

⚠️ If no compatible viewer is installed, BPMN files will be displayed in raw XML format (text mode) by default.


## Download

You can download the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=IOEvent.ioevent-studio).

## Features

### ✅ Automatic BPMN Generation from Natural Language

- Input a simple sentence, step-by-step instructions, or a descriptive paragraph.  
- It automatically generates a structured and BPMN 2.0-compliant diagram.  
- This feature accelerates modeling, even for those without BPMN technical expertise.  
- All generated diagrams are automatically saved to your predefined destination.

### ✅ Edit and Modify Generated BPMNs

- Enter a new natural language description to automatically update the diagram.  
- Easily add, remove, or rearrange components (tasks, events, gateways, etc.).  
- All changes are automatically saved, ensuring better traceability and organization.

### ✅ Import and Optimize Existing BPMN Files

- Easily import any .bpmn file from your local system:

  - Clicking the “Upload BPMN” button in the assistant UI
  - Right-clicking a bpmn file in your VS Code workspace and selecting:
  ➤ IOEvent BPMN Studio: Add File to Assistant.
- Leverage **AI-powered analysis** to:
  - **Restructure the layout** for improved readability and visual clarity.
  - **Fix structural or semantic issues** that may prevent compliance with **BPMN 2.0** (e.g., missing end events, invalid gateways, or broken sequence flows).
- All improvements are automatically saved to your predefined workspace or folder, ensuring optimized and standardized process models.

### ✅ History Tracking
- Maintain a full conversation history tied to each BPMN diagram.
- Enable users to seamlessly resume editing the BPMN diagram linked to an ongoing conversation, with options to either save updates to the existing file or generate a new one if none exists.

