export const processAllElements = (context, { events = [], tasks = [], gateways = [] }) => {
  const processEvent = (event) => {
    const id = event.id;
    const name = event.name;
    let type, eventType;
    const attachedTo = event.attachedTo || null;

    switch (normalizeType(event.type)) {
      case "start":
        type = "startEvent";
        eventType = "start";
        break;
      case "timerstart":
        type = "startEvent";
        eventType = "timer";
        break;
      case "timercatch":
        type = "intermediateCatchEvent";
        eventType = "timer";
        break;
      case "boundarytimer":
        type = "boundaryEvent";
        eventType = "timer";
        break;
      case "boundaryerror":
        type = "boundaryEvent";
        eventType = "error";
        break;
      case "end":
        type = "endEvent";
        eventType = "end";
        break;
      case "errorend":
        type = "endEvent";
        eventType = "errorEnd";
        break;
      default:
        console.warn("Type d'événement inconnu:", event.type);
        return null;
    }

    return {
      id,
      type,
      eventType,
      isBoundary: type === "boundaryEvent",
      name,
      attachedTo
    };
  };

  const processTask = (task) => {
    const validTypes = ["userTask", "serviceTask", "undefinedTask"];
    const type = task.type;
    if (!validTypes.includes(type)) {
      console.warn(`Type de tâche inconnu: ${task.type}`);
      return null;
    }

    return {
      id: task.id,
      type,
      name: task.name
    };
  };

  const processGateway = (gateway) => ({
    id: gateway.id,
    type: `${gateway.type.toLowerCase()}Gateway`,
    name: gateway.name,
  });

  const processElement = (item) => {
    let element;
    switch (item.category) {
      case "event":
        element = processEvent(item);
        break;
      case "task":
        element = processTask(item);
        break;
      case "gateway":
        element = processGateway(item);
        break;
      default:
        console.warn("Catégorie d'élément inconnue:", item.category);
        return;
    }

    if (element) {
      context.elements.set(element.id, element);

      if (element.isBoundary && element.attachedTo) {
        if (!context.elements.has(element.attachedTo)) {
          console.warn(`Boundary event ${element.id} attached to unknown task ${element.attachedTo}`);
        }
        context.boundaryAttachments.set(element.id, element.attachedTo);
      }
    }
  };

  [
    ...events.map((e) => ({ ...e, category: "event" })),
    ...tasks.map((t) => ({ ...t, category: "task" })),
    ...gateways.map((g) => ({ ...g, category: "gateway" })),
  ].forEach(processElement);
};

const normalizeType = (type) => type.toLowerCase().replace(/\s+/g, "");