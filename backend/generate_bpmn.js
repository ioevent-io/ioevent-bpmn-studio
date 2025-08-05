import convertJsonBPMN from "./src/builder/convertJsonBPMN.js";
import {
  initializeConnections,
  processFlows,
} from "./src/utils/connectionManager.js";
import { processAllElements } from "./src/utils/ElementProcessor.js";
import enforceBpmnRules from "./src/utils/enforceBpmnRules.js";


export default async function generate_bpmn(
  params,
  token,
  userEmail,
  threadId,
  session
) {
  try {
    const { tasks, events, gateways, flows } = params;

    const context = {
      elements: new Map(),
      connections: {},
      boundaryAttachments: new Map(),
      elementsPositions: {},
      sequenceFlows: [],
      layoutConfig: {
        startX: 60,
        startY: 80,
        layerSpacing: 160,
        rowSpacing: 120,
        elementConfigs: {
          task: { width: 160, height: 80 },
          exclusiveGateway: { width: 60, height: 60 },
          parallelGateway: { width: 60, height: 60 },
          boundaryEvent: { width: 30, height: 30, offsetX: 12, offsetY: -12 },
          startEvent: { width: 40, height: 40 },
          endEvent: { width: 40, height: 40 },
          intermediateCatchEvent: { width: 40, height: 40 },
        },
        onAfterArrange: (positions) => {
          Object.entries(positions).forEach(([id, pos]) => {
            pos.x = Math.round(pos.x / 10) * 10;
            pos.y = Math.round(pos.y / 10) * 10;
          });
        },
      },
    };

    initializeConnections(context, { events, tasks, gateways });
    processAllElements(context, { events, tasks, gateways });
    processFlows(context, flows);
    const validate = enforceBpmnRules(context);
    console.log(validate);
    if (validate.status === "error") {
      return JSON.stringify({
        error: "Validation errors found in BPMN.",
        details: validate.issues,
      });
    } else {
      const xml = convertJsonBPMN(context);
      return JSON.stringify({
        message: "BPMN généré avec succès.",
        xml,
      });
    }
  } catch (error) {
    console.error("❌ Erreur lors de la génération BPMN:", error);
    return JSON.stringify({
      error: "Erreur lors de la génération BPMN.",
      details: error.message,
    });
  }
}
