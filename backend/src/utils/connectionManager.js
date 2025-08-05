export const initializeConnections = (context, elements) => {
  const connectionConfig = [
    { items: elements.events, idFunc: (e) => e.id },
    { items: elements.tasks, idFunc: (t) => t.id },
    { items: elements.gateways, idFunc: (g) => g.id },
  ].filter(config => config.items);
  
  connectionConfig.forEach(({ items, idFunc }) => {
    items.forEach((item) => {
      const id = idFunc(item);
      context.connections[id] = { incoming: [], outgoing: [] };
      if (!context.elements.has(id)) {
        context.elements.set(id, item);
      }
    });
  });
};
export const processFlows = (context, flows) => {
  flows.forEach((flow, index) => {
    const { source, target, condition } = flow;
    if (!context.elements.has(source)) {
      console.warn(`Flux invalide: source introuvable: ${source}`);
      return;
    }
    if (!context.elements.has(target)) {
      console.warn(`Flux invalide: target introuvable: ${target}`);
      return;
    }

    const flowId = `Flow_${index + 1}`;
    updateConnections(context, source, target, flowId);
    context.sequenceFlows.push(
      createSequenceFlow(flowId, source, target, condition)
    );
  });
};
const updateConnections = (context, sourceId, targetId, flowId) => {
  if (!context.connections[sourceId]) {
    context.connections[sourceId] = { incoming: [], outgoing: [] };
  }
  if (!context.connections[targetId]) {
    context.connections[targetId] = { incoming: [], outgoing: [] };
  }
  context.connections[sourceId].outgoing.push(flowId);
  context.connections[targetId].incoming.push(flowId);
};
const createSequenceFlow = (id, sourceId, targetId, condition) => ({
  id,
  sourceId,
  targetId,
  condition: condition || "",
});
