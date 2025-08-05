export default class BpmnBuilder {
  constructor(context) {
    this.context = context;
    this.templates = {
      processStart: (timestamp) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  id="Definitions_${timestamp}"
  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_${timestamp}" isExecutable="true">`,
      elementTypeMap: {
        startEvent: "bpmn:startEvent",
        endEvent: "bpmn:endEvent",
        errorEndEvent: "bpmn:endEvent",
        undefinedTask: "bpmn:task",
        userTask: "bpmn:userTask",
        serviceTask: "bpmn:serviceTask",
        exclusiveGateway: "bpmn:exclusiveGateway",
        parallelGateway: "bpmn:parallelGateway",
        inclusiveGateway: "bpmn:inclusiveGateway",
        intermediateCatchEvent: "bpmn:intermediateCatchEvent",
        boundaryEvent: "bpmn:boundaryEvent",
      },
    };
  }

  build(layout) {
    const timestamp = Date.now();
    let xml = this.templates.processStart(timestamp);
    xml += this.generateProcessElements(layout);
    xml += this.generateSequenceFlows();
    xml += `  </bpmn:process>\n`;
    xml += this.generateBpmnDiagram(timestamp, layout);
    xml += `</bpmn:definitions>`;
    return xml;
  }

  generateProcessElements(layout) {
    return layout
      .map((el) => {
        const element = this.context.elements.get(el.id);
        if (!element) return "";

        let xml = `<${this.templates.elementTypeMap[element.type]} id="${
          el.id
        }"`;

        if (element.type === "boundaryEvent") {
          const attachedTo =
            element.attachedTo || this.context.boundaryAttachments.get(el.id);
          if (attachedTo) {
            xml += ` attachedToRef="${attachedTo}"`;
          }
        }

        xml += ` name="${element.name || ""}">\n`;
        xml += this.generateEventDefinition(element);

        const connections = this.context.connections[el.id] || {
          incoming: [],
          outgoing: [],
        };
        xml += [
          ...connections.incoming.map(
            (id) => `      <bpmn:incoming>${id}</bpmn:incoming>`
          ),
          ...connections.outgoing.map(
            (id) => `      <bpmn:outgoing>${id}</bpmn:outgoing>`
          ),
        ].join("\n");

        xml += `\n    </${this.templates.elementTypeMap[element.type]}>\n`;
        return xml;
      })
      .join("");
  }

  generateEventDefinition(element) {
    let eventDefinitionXml = "";
    if (element.eventType === "timer") {
      eventDefinitionXml += `      <bpmn:timerEventDefinition/>\n`;
    }
    if (element.eventType === "errorEnd" || element.eventType === "error") {
      eventDefinitionXml += `      <bpmn:errorEventDefinition/>\n`;
    }
    return eventDefinitionXml;
  }

  generateSequenceFlows() {
    return this.context.sequenceFlows
      .map((flow, index) => {
        const id = flow.id || `Flow_${index + 1}`;
        const sourceId = flow.sourceId || flow.source;
        const targetId = flow.targetId || flow.target;

        if (!sourceId || !targetId) {
          console.warn(`Flux de séquence invalide détecté:`, flow);
          return "";
        }

        const condition =
          typeof flow.condition === "string" ? flow.condition : "";

        return `    <bpmn:sequenceFlow id="${id}" sourceRef="${sourceId}" targetRef="${targetId}" name="${condition}"/>\n`;
      })
      .join("");
  }

  generateBpmnDiagram(timestamp, layout) {
    return `  <bpmndi:BPMNDiagram id="BPMNDiagram_${timestamp}">
    <bpmndi:BPMNPlane id="BPMNPlane_${timestamp}" bpmnElement="Process_${timestamp}">
${this.generateShapes(layout)}
${this.generateEdges()}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>\n`;
  }

  generateShapes(layout) {
    return layout
      .map((el) => {
        if (
          typeof el.x !== "number" ||
          typeof el.y !== "number" ||
          typeof el.width !== "number" ||
          typeof el.height !== "number"
        )
          return "";
        return `      <bpmndi:BPMNShape id="BPMNShape_${el.id}" bpmnElement="${el.id}">
        <dc:Bounds x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" />
      </bpmndi:BPMNShape>`;
      })
      .join("\n");
  }

  generateEdges() {
    const FLOW_SPACING = 20;
    const EMPTY_BRANCH_HEIGHT = 100; 
    const flowOffsets = {};
    const ELEMENT_MARGIN = 10;

    return this.context.sequenceFlows
      .map((flow, index) => {
        const source = this.context.elementsPositions[flow.sourceId];
        const target = this.context.elementsPositions[flow.targetId];
        if (!source || !target) return "";

        const sourceElement = this.context.elements.get(flow.sourceId);
        const targetElement = this.context.elements.get(flow.targetId);
        const isGateway = /Gateway/i.test(sourceElement?.type || "");
        const isDirectEndEvent = targetElement && 
          (targetElement.type === 'endEvent' || targetElement.type === 'errorEndEvent');
        const isBackward = target.x < source.x;

        const generateBaseWaypoints = () => {
          const startX = source.x + source.width;
          const startY = source.y + source.height / 2;
          const endX = target.x;
          const endY = target.y + target.height / 2;

          if (isBackward) {
            const offsetY = 100;
            return [
              { x: startX, y: startY },
              { x: startX + 50, y: startY },
              { x: startX + 50, y: startY + offsetY },
              { x: endX - 50, y: startY + offsetY },
              { x: endX - 50, y: endY },
              { x: endX, y: endY },
            ];
          } else if (isGateway) {
            const count = flowOffsets[flow.sourceId] || 0;
            const direction = count % 2 === 0 ? -1 : 1;
            const offsetValue = (Math.floor(count / 2) + 1) * FLOW_SPACING;
            flowOffsets[flow.sourceId] = count + 1;

            const sourceCenterX = source.x + source.width / 2;
            const targetCenterY = target.y + target.height / 2;

            if (isDirectEndEvent) {
              const verticalY = source.y + source.height + EMPTY_BRANCH_HEIGHT;
              return [
                { x: sourceCenterX, y: source.y + source.height },
                { x: sourceCenterX, y: verticalY },
                { x: endX, y: verticalY },
                { x: endX, y: targetCenterY },
              ];
            } else {
              const verticalY =
                direction === -1
                  ? Math.min(source.y - offsetValue, targetCenterY)
                  : Math.max(
                      source.y + source.height + offsetValue,
                      targetCenterY
                    );

              return [
                {
                  x: sourceCenterX,
                  y: direction === -1 ? source.y : source.y + source.height,
                },
                { x: sourceCenterX, y: verticalY },
                { x: endX, y: verticalY },
                { x: endX, y: targetCenterY },
              ];
            }
          } else {
            const midX = (startX + endX) / 2;
            return [
              { x: startX, y: startY },
              { x: midX, y: startY },
              { x: midX, y: endY },
              { x: endX, y: endY },
            ];
          }
        };

        const hitsElement = (waypoints) => {
          for (const [id, element] of Object.entries(
            this.context.elementsPositions
          )) {
            if (id === flow.sourceId || id === flow.targetId) continue;
            const paddedElement = {
              x: element.x - ELEMENT_MARGIN,
              y: element.y - ELEMENT_MARGIN,
              width: element.width + 2 * ELEMENT_MARGIN,
              height: element.height + 2 * ELEMENT_MARGIN,
            };

            for (let i = 0; i < waypoints.length - 1; i++) {
              const seg = {
                p1: waypoints[i],
                p2: waypoints[i + 1],
              };
              if (this.segmentIntersectsRect(seg, paddedElement)) {
                return true;
              }
            }
          }
          return false;
        };

        let waypoints = generateBaseWaypoints();
        let attempts = 0;
        const MAX_ATTEMPTS = 3;

        while (hitsElement(waypoints) && attempts < MAX_ATTEMPTS) {
          attempts++;
          const offset = attempts * FLOW_SPACING;

          waypoints = [
            { x: source.x + source.width, y: source.y + source.height / 2 },
            {
              x: source.x + source.width + offset,
              y: source.y + source.height / 2,
            },
            {
              x: source.x + source.width + offset,
              y: target.y + target.height / 2,
            },
            { x: target.x, y: target.y + target.height / 2 },
          ];
        }

        const waypointXml = waypoints
          .map((pt) => `        <di:waypoint x="${pt.x}" y="${pt.y}" />`)
          .join("\n");

        return `      <bpmndi:BPMNEdge id="BPMNEdge_${flow.id}" bpmnElement="${flow.id}">
${waypointXml}
      </bpmndi:BPMNEdge>`;
      })
      .join("\n");
  }

  segmentIntersectsRect(seg, rect) {
    const edges = [
      {
        p1: { x: rect.x, y: rect.y },
        p2: { x: rect.x + rect.width, y: rect.y },
      },
      {
        p1: { x: rect.x + rect.width, y: rect.y },
        p2: { x: rect.x + rect.width, y: rect.y + rect.height },
      },
      {
        p1: { x: rect.x, y: rect.y + rect.height },
        p2: { x: rect.x + rect.width, y: rect.y + rect.height },
      },
      {
        p1: { x: rect.x, y: rect.y },
        p2: { x: rect.x, y: rect.y + rect.height },
      },
    ];

    for (const edge of edges) {
      if (this.segmentsIntersect(seg, edge)) {
        return true;
      }
    }
    return false;
  }

  segmentsIntersect(seg1, seg2) {
    const ccw = (A, B, C) =>
      (C.y - A.y) * (B.x - A.x) > (B.y - A.y) * (C.x - A.x);
    return (
      ccw(seg1.p1, seg2.p1, seg2.p2) !== ccw(seg1.p2, seg2.p1, seg2.p2) &&
      ccw(seg1.p1, seg1.p2, seg2.p1) !== ccw(seg1.p1, seg1.p2, seg2.p2)
    );
  }
}