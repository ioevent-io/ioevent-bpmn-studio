import fs from "fs";
import LayoutManager from "../layout/layoutManager.js";
import BpmnBuilder from "./bpmnBuilder.js";

export default function convertJsonBPMN(context) {

  const layout = new LayoutManager(context).arrangeElements([
    ...context.elements.values(),
  ]);

  const bpmnXml = new BpmnBuilder(context).build(layout);
  // const outputPath = "./diagrams/diagram.bpmn";

  // fs.writeFileSync(outputPath, bpmnXml, "utf8");
  // console.log(`BPMN XML file has been saved at: ${outputPath}`);

  return bpmnXml;
}


// import fs from "fs";
// import LayoutManager from "../layout/layoutManager.js";
// import BpmnBuilder from "./bpmnBuilder.js";
// import {
//   initializeConnections,
//   processFlows,
// } from "../utils/connectionManager.js";
// import { processAllElements } from "../utils/ElementProcessor.js";
// import enforceBpmnRules from "../utils/enforceBpmnRules.js";

// export default function convertJsonBPMN(bpmnData) {
//   const { tasks, events, gateways, flows } = bpmnData;

//   const context = {
//     elements: new Map(),
//     connections: {},
//     boundaryAttachments: new Map(),
//     elementsPositions: {},
//     sequenceFlows: [],
//     layoutConfig: {
//       startX: 60,
//       startY: 80,
//       layerSpacing: 160,
//       rowSpacing: 120,
//       elementConfigs: {
//         task: { width: 160, height: 80 },
//         exclusiveGateway: { width: 60, height: 60 },
//         parallelGateway: { width: 60, height: 60 },
//         boundaryEvent: { width: 30, height: 30, offsetX: 12, offsetY: -12 },
//         startEvent: { width: 40, height: 40 },
//         endEvent: { width: 40, height: 40 },
//         intermediateCatchEvent: { width: 36, height: 36 },
//       },
//       onAfterArrange: (positions) => {
//         Object.entries(positions).forEach(([id, pos]) => {
//           pos.x = Math.round(pos.x / 10) * 10;
//           pos.y = Math.round(pos.y / 10) * 10;
//         });
//       },
//     },
//   };

//   initializeConnections(context, { events, tasks, gateways });
//   processAllElements(context, { events, tasks, gateways });
//   processFlows(context, flows);
//   console.log(enforceBpmnRules(context)); 
//   const layout = new LayoutManager(context).arrangeElements([
//     ...context.elements.values(),
//   ]);

//   const bpmnXml = new BpmnBuilder(context).build(layout);
//   const outputPath = "./diagrams/diagram.bpmn";

//   fs.writeFileSync(outputPath, bpmnXml, "utf8");
//   console.log(`BPMN XML file has been saved at: ${outputPath}`);

//   return bpmnXml;
// }



