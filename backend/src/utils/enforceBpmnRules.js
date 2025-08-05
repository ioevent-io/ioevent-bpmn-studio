export default function enforceBpmnRules(context) {
  const issues = [];

  detectCriticalIssues(context, issues);

  detectDisconnectedElements(context, issues);
  detectSimplifiableGateways(context, issues);
  detectInvalidTasks(context, issues);
  detectInvalidStartEndEvents(context, issues);
  detectInvalidBoundaryAttachments(context, issues);

  return formatValidationResult(issues);
}

function detectDisconnectedElements(context, issues) {
  for (const [id, conn] of Object.entries(context.connections)) {
    const element = context.elements.get(id);
    if (!element) continue;

    if (
      conn.incoming.length === 0 &&
      conn.outgoing.length === 0 &&
      !["startEvent", "endEvent"].includes(element.type)
    ) {
      issues.push({
        type: "disconnectedElement",
        element: id,
        message: `Element '${id}' has no incoming or outgoing connections — verify its placement or remove it if unnecessary.`
      });
    }
  }
}

function detectSimplifiableGateways(context, issues) {
  for (const [id, conn] of Object.entries(context.connections)) {
    const element = context.elements.get(id);
    if (!element || !shouldSimplifyGateway(element, conn)) continue;

    const { incomingFlow, outgoingFlow } = getFlowsForGateway(context, conn);

    if (incomingFlow && outgoingFlow && !isLoop(incomingFlow, outgoingFlow)) {
      issues.push({
        type: "simplifiableGateway",
        element: id,
        message: `Gateway '${id}' has only one incoming and one outgoing flow — consider removing it and connecting the elements directly.`
      });
    }
  }
}

function detectInvalidTasks(context, issues) {
  for (const [id, conn] of Object.entries(context.connections)) {
    const element = context.elements.get(id);
    if (!element || !element.type.endsWith("Task")) continue;

    if (conn.incoming.length === 0 && element.type !== "startEvent") {
      issues.push({
        type: "taskWithoutIncomingFlow",
        element: id,
        message: `Task '${id}' must have at least one incoming flow to be part of the process.`
      });
    }
    if (conn.outgoing.length === 0 && element.type !== "endEvent") {
      issues.push({
        type: "taskWithoutOutgoingFlow",
        element: id,
        message: `Task '${id}' must have at least one outgoing flow to continue the process.`
      });
    }
  }
}

function detectInvalidStartEndEvents(context, issues) {
  for (const [id, conn] of Object.entries(context.connections)) {
    const element = context.elements.get(id);
    if (!element) continue;

    if (element.type === "startEvent" && conn.outgoing.length === 0) {
      issues.push({
        type: "startEventWithoutOutgoingFlow",
        element: id,
        message: `StartEvent '${id}' has no outgoing flow — it must initiate the process flow.`
      });
    }

    if (element.type === "endEvent" && conn.outgoing.length > 0) {
      issues.push({
        type: "endEventWithOutgoingFlow",
        element: id,
        message: `EndEvent '${id}' should not have any outgoing flows — it must terminate the process.`
      });
    }
  }
}

function detectInvalidBoundaryAttachments(context, issues) {
  context.boundaryAttachments.forEach((attachedToId, boundaryId) => {
    if (!context.elements.has(attachedToId)) {
      issues.push({
        type: "invalidBoundaryAttachment",
        element: boundaryId,
        message: `Boundary event '${boundaryId}' is attached to a non-existent or invalid element.`
      });
    }
  });
}

function shouldSimplifyGateway(element, conn) {
  return (
    element.type.includes("Gateway") &&
    !element.type.includes("EventBased") &&
    conn.incoming.length === 1 &&
    conn.outgoing.length === 1
  );
}

function getFlowsForGateway(context, conn) {
  return {
    incomingFlow: context.sequenceFlows.find((f) => f.id === conn.incoming[0]),
    outgoingFlow: context.sequenceFlows.find((f) => f.id === conn.outgoing[0]),
  };
}

function isLoop(incomingFlow, outgoingFlow) {
  return incomingFlow.sourceId === outgoingFlow.targetId;
}

function detectCriticalIssues(context, issues) {
  const { elements, connections, sequenceFlows } = context;

  checkStartAndEndEvents(elements, connections, issues);
  checkInvalidEndPoints(elements, connections, issues);
  checkDirectTaskLoops(elements, connections, sequenceFlows, issues);
  checkMultipleStartEvents(elements, connections, issues);
}

function checkStartAndEndEvents(elements, connections, issues) {
  const startEvents = [...elements.values()].filter(
    (e) => e.type === "startEvent" && connections[e.id]?.outgoing.length > 0
  );

  const endEvents = [...elements.values()].filter(
    (e) => e.type === "endEvent" && connections[e.id]?.incoming.length > 0
  );

  if (startEvents.length === 0) {
    issues.push({
      type: "missingStartEvent",
      message: `The process must contain at least one valid startEvent with an outgoing flow.`
    });
  }

  if (endEvents.length === 0) {
    issues.push({
      type: "missingEndEvent",
      message: `The process must contain at least one valid endEvent with an incoming flow.`
    });
  }
}

function checkInvalidEndPoints(elements, connections, issues) {
  [...elements.values()].forEach((element) => {
    const conn = connections[element.id];
    if (!conn) return;

    if (
      conn.outgoing.length === 0 &&
      element.type !== "endEvent" &&
      !element.type.endsWith("Event")
    ) {
      issues.push({
        type: "invalidEndPoint",
        element: element.id,
        message: `Element '${element.id}' ends the process flow but is not an endEvent — please connect it to a valid element or replace it with an endEvent.`
      });
    }
  });
}

function checkDirectTaskLoops(elements, connections, sequenceFlows, issues) {
  const taskConnections = {};

  [...elements.values()]
    .filter((e) => e.type.endsWith("Task"))
    .forEach((task) => {
      taskConnections[task.id] = {
        incoming: (connections[task.id]?.incoming || [])
          .map((flowId) => sequenceFlows.find((f) => f.id === flowId)?.sourceId)
          .filter(Boolean),
        outgoing: (connections[task.id]?.outgoing || [])
          .map((flowId) => sequenceFlows.find((f) => f.id === flowId)?.targetId)
          .filter(Boolean),
      };
    });

  Object.entries(taskConnections).forEach(([taskId, conn]) => {
    conn.outgoing.forEach((targetId) => {
      if (taskConnections[targetId]?.outgoing.includes(taskId)) {
        issues.push({
          type: "directLoop",
          element: taskId,
          message: `There is a direct loop between tasks '${taskId}' and '${targetId}' — add a gateway to manage the loop properly.`
        });
      }
    });
  });
}

function checkMultipleStartEvents(elements, connections, issues) {
  const startEvents = [...elements.values()].filter(
    (e) => e.type === "startEvent" && connections[e.id]?.outgoing.length > 0
  );

  if (startEvents.length > 1) {
    issues.push({
      type: "multipleStartEvents",
      message: `The process contains multiple startEvents — only one is allowed. Found: ${startEvents.length}.`
    });
  }
}

function formatValidationResult(issues) {
  return {
    status: issues.length === 0 ? "ok" : "error",
    message: issues.length === 0
      ? "The BPMN model is valid"
      : "The BPMN model contains errors that must be corrected",
    issues: issues,
  };
}