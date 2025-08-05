import xml2js from "xml2js";

export default async function extractElements(xmlContent) {
  const parser = new xml2js.Parser({ explicitArray: false });
  const parsed = await parser.parseStringPromise(xmlContent);

  const definitions = parsed["bpmn:definitions"];
  const process = definitions["bpmn:process"];

  const extractTasks = () => {
    const tasks = [];
    const taskTypes = ["bpmn:task", "bpmn:userTask", "bpmn:serviceTask"];

    for (const tag of taskTypes) {
      const elements = process[tag];
      if (!elements) continue;

      const list = Array.isArray(elements) ? elements : [elements];
      for (const task of list) {
        if (!task["$"]) continue;

        let outputType;
        switch (tag) {
          case "bpmn:userTask":
            outputType = "userTask";
            break;
          case "bpmn:serviceTask":
            outputType = "serviceTask";
            break;
          case "bpmn:task":
          default:
            outputType = "task";
        }

        tasks.push({
          id: task["$"].id,
          name: task["$"].name || "",
          type: outputType,
        });
      }
    }

    const otherTasks = Object.entries(process)
      .filter(
        ([tag]) =>
          tag.startsWith("bpmn:") &&
          tag.endsWith("Task") &&
          !taskTypes.includes(tag)
      )
      .flatMap(([tag, elements]) => {
        const list = Array.isArray(elements) ? elements : [elements];
        return list.map((task) => ({
          id: task["$"].id,
          name: task["$"].name || "",
          type: "undefinedTask",
        }));
      });

    return [...tasks, ...otherTasks];
  };

  const extractEvents = () => {
    const events = [];
    const entries = {
      "bpmn:startEvent": "Start",
      "bpmn:endEvent": "End",
      "bpmn:boundaryEvent": (e) =>
        e["bpmn:errorEventDefinition"] ? "boundaryError" : "boundaryTimer",
    };

    for (const tag in entries) {
      const raw = process[tag];
      if (!raw) continue;
      const list = Array.isArray(raw) ? raw : [raw];
      for (const e of list) {
        const type =
          typeof entries[tag] === "function" ? entries[tag](e) : entries[tag];
        events.push({
          id: e["$"].id,
          name: e["$"].name || "",
          type,
          attachedTo: e["$"].attachedToRef || undefined,
        });
      }
    }

    return events;
  };

  const extractGateways = () => {
    const types = {
      "bpmn:exclusiveGateway": "Exclusive",
      "bpmn:inclusiveGateway": "Inclusive",
      "bpmn:parallelGateway": "Parallel",
    };

    return Object.entries(types).flatMap(([tag, type]) => {
      const list = process[tag];
      if (!list) return [];
      const items = Array.isArray(list) ? list : [list];
      return items.map((gw) => ({
        id: gw["$"].id,
        name: gw["$"].name || "",
        type,
      }));
    });
  };

  const extractFlows = () => {
    const rawFlows = process["bpmn:sequenceFlow"];
    if (!rawFlows) return [];
    const flows = Array.isArray(rawFlows) ? rawFlows : [rawFlows];
    return flows.map((flow) => ({
      source: flow["$"].sourceRef,
      target: flow["$"].targetRef,
      condition: flow["bpmn:conditionExpression"]?._ || undefined,
    }));
  };

  return {
    tasks: extractTasks(),
    events: extractEvents(),
    gateways: extractGateways(),
    flows: extractFlows(),
  };
}
