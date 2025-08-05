export default class LayoutManager {
  constructor(context) {
    const layoutConfig = context.layoutConfig || {};
    this.context = context;
    this.config = {
      startX: layoutConfig.startX ?? 60,
      startY: layoutConfig.startY ?? 60,
      layerSpacing: layoutConfig.layerSpacing ?? 150,
      nodeSpacing: layoutConfig.rowSpacing ?? 100,
      elementConfigs: {
        startEvent: { width: 48, height: 48 },
        endEvent: { width: 48, height: 48 },
        boundaryEvent: { width: 32, height: 32, offsetX: 0, offsetY: 8 },
        task: { width: 160, height: 100 },
        exclusiveGateway: { width: 60, height: 60 },
        parallelGateway: { width: 60, height: 60 },
        intermediateCatchEvent: { width: 40, height: 40 },
        ...(layoutConfig.elementConfigs || {}),
      },
      onBeforeArrange: layoutConfig.onBeforeArrange || null,
      onAfterArrange: layoutConfig.onAfterArrange || null,
    };
    this.depthMap = new Map();
    this.branchMap = new Map();
    this.backEdges = [];
    this.loopNestingMap = new Map();
  }

  getElementConfig(type) {
    return (
      this.config.elementConfigs[type] || {
        width: 100,
        height: 80,
        offsetX: 0,
        offsetY: 0,
      }
    );
  }

  arrangeElements(elements) {
    this.config.onBeforeArrange?.(elements);

    const mainElements = elements.filter((el) => el.type !== "boundaryEvent");
    const boundaryEvents = elements.filter((el) => el.type === "boundaryEvent");

    const { adjacency, reverseAdjacency } =
      this.buildAdjacencyGraphs(mainElements);
    this.backEdges = this.detectBackEdges(adjacency);

    this.calculateLoopNestingLevels(mainElements, adjacency);

    const depth = this.calculateNodeDepths(
      mainElements,
      adjacency,
      reverseAdjacency
    );
    this.depthMap = depth;

    this.identifyBranches(mainElements, adjacency);

    const layers = this.groupElementsByLayers(mainElements, depth);
    const positions = this.calculateLayerPositions(layers, reverseAdjacency);

    this.alignSequentialElements(
      mainElements,
      adjacency,
      reverseAdjacency,
      positions
    );
    this.adjustGatewayAlignment(
      mainElements,
      adjacency,
      reverseAdjacency,
      positions
    );
    this.placeBoundaryEvents(boundaryEvents, positions);

    this.adjustEndEventsPosition(mainElements, positions);

    this.context.elementsPositions = positions;
    this.context.backEdges = this.backEdges;
    this.config.onAfterArrange?.(positions);

    return elements.map((el) => ({ ...el, ...positions[el.id] }));
  }

  adjustEndEventsPosition(nodes, positions) {
    const endEvents = nodes.filter(node => node.type === 'endEvent');
    if (endEvents.length === 0) return;

    const maxDepth = Math.max(...Array.from(this.depthMap.values()));

    const endGroups = new Map();
    endEvents.forEach(event => {
      const depth = this.depthMap.get(event.id) || 0;
      const branch = this.branchMap.get(event.id) || 'main';

      if (!endGroups.has(branch)) endGroups.set(branch, []);
      endGroups.get(branch).push({ event, depth });
    });

    if (endGroups.has('main')) {
      const mainEnds = endGroups.get('main').filter(e => e.depth === maxDepth);

      if (mainEnds.length === 1) {
        const event = mainEnds[0].event;
        const mainBranchNodes = Array.from(this.branchMap.entries())
          .filter(([_, b]) => b === 'main')
          .map(([id]) => id);

        const mainPositions = mainBranchNodes
          .map(id => positions[id])
          .filter(Boolean);

        if (mainPositions.length > 0) {
          const minY = Math.min(...mainPositions.map(p => p.y));
          const maxY = Math.max(...mainPositions.map(p => p.y + p.height));
          const centerY = (minY + maxY) / 2;

          positions[event.id].y = centerY - positions[event.id].height / 2;
        }
      }
    }
  }

  calculateLoopNestingLevels(nodes, adjacency) {
    const scc = this.findStronglyConnectedComponents(adjacency);
    this.loopNestingMap.clear();

    scc.forEach(component => {
      if (component.size > 1) {
        component.forEach(nodeId => {
          const currentLevel = this.loopNestingMap.get(nodeId) || 0;
          this.loopNestingMap.set(nodeId, currentLevel + 1);
        });
      }
    });
  }

  findStronglyConnectedComponents(adjacency) {
    let index = 0;
    const stack = [];
    const indices = new Map();
    const lowlinks = new Map();
    const onStack = new Map();
    const components = [];

    const strongconnect = (nodeId) => {
      indices.set(nodeId, index);
      lowlinks.set(nodeId, index);
      index++;
      stack.push(nodeId);
      onStack.set(nodeId, true);

      for (const neighborId of adjacency.get(nodeId) || []) {
        if (!indices.has(neighborId)) {
          strongconnect(neighborId);
          lowlinks.set(nodeId, Math.min(lowlinks.get(nodeId), lowlinks.get(neighborId)));
        } else if (onStack.get(neighborId)) {
          lowlinks.set(nodeId, Math.min(lowlinks.get(nodeId), indices.get(neighborId)));
        }
      }

      if (lowlinks.get(nodeId) === indices.get(nodeId)) {
        const component = new Set();
        let w;
        do {
          w = stack.pop();
          onStack.set(w, false);
          component.add(w);
        } while (w !== nodeId);
        components.push(component);
      }
    };

    for (const nodeId of adjacency.keys()) {
      if (!indices.has(nodeId)) {
        strongconnect(nodeId);
      }
    }

    return components;
  }

  buildAdjacencyGraphs(nodes) {
    const adjacency = new Map();
    const reverseAdjacency = new Map();

    nodes.forEach((node) => {
      adjacency.set(node.id, []);
      reverseAdjacency.set(node.id, []);
    });

    this.context.sequenceFlows.forEach((flow) => {
      adjacency.get(flow.sourceId)?.push(flow.targetId);
      reverseAdjacency.get(flow.targetId)?.push(flow.sourceId);
    });

    return { adjacency, reverseAdjacency };
  }

  calculateNodeDepths(nodes, adjacency, reverseAdjacency) {
    const depthMap = new Map();
    const visited = new Set();

    const startNode = nodes.find(node => node.type === 'startEvent');
    const startNodes = startNode ? [startNode] : nodes.filter(
      (node) => (reverseAdjacency.get(node.id) || []).length === 0
    );

    const queue = [...startNodes];
    startNodes.forEach((node) => {
      depthMap.set(node.id, 0);
      visited.add(node.id);
    });

    while (queue.length > 0) {
      const node = queue.shift();
      const currentDepth = depthMap.get(node.id);

      for (const neighborId of adjacency.get(node.id) || []) {
        const isBackEdge = this.backEdges.some(
          (edge) => edge.source === node.id && edge.target === neighborId
        );

        if (isBackEdge) continue;

        const neighborNode = nodes.find((n) => n.id === neighborId);
        if (!visited.has(neighborId)) {
          visited.add(neighborId);

          const loopLevel = this.loopNestingMap.get(neighborId) || 0;
          const newDepth = currentDepth + 1 + loopLevel;

          depthMap.set(neighborId, newDepth);
          queue.push(neighborNode);
        } else {
          const existingDepth = depthMap.get(neighborId) || 0;
          const loopLevel = this.loopNestingMap.get(neighborId) || 0;
          const proposedDepth = currentDepth + 1 + loopLevel;

          if (proposedDepth > existingDepth) {
            depthMap.set(neighborId, proposedDepth);
          }
        }
      }
    }

    nodes.forEach((node) => {
      if (!visited.has(node.id)) {
        depthMap.set(node.id, 0);
      }
    });

    return depthMap;
  }

  groupElementsByLayers(nodes, depthMap) {
    const layers = {};
    nodes.forEach((node) => {
      const layer = depthMap.get(node.id) || 0;
      if (!layers[layer]) layers[layer] = [];
      layers[layer].push(node);
    });
    return layers;
  }

  calculateLayerPositions(layers, reverseAdjacency) {
    const positions = {};
    const layerHeights = {};
    const maxLayer = Math.max(...Object.keys(layers).map(Number));

    let maxHeight = 0;
    Object.keys(layers).forEach((layer) => {
      const nodes = layers[layer];
      let height = nodes.reduce((sum, node) => {
        const cfg = this.getElementConfig(node.type);
        return sum + cfg.height + this.config.nodeSpacing;
      }, -this.config.nodeSpacing);
      layerHeights[layer] = height;
      if (height > maxHeight) maxHeight = height;
    });

    Object.entries(layers).forEach(([layer, nodes]) => {
      const layerIdx = Number(layer);
      const baseX = this.config.startX + layerIdx * this.config.layerSpacing;
      const startY = this.config.startY + (maxHeight - layerHeights[layer]) / 2;

      nodes.sort((a, b) => {
        const predsA = reverseAdjacency.get(a.id) || [];
        const centerA =
          predsA.reduce((sum, id) => {
            const pos = positions[id];
            return sum + (pos ? pos.y + pos.height / 2 : 0);
          }, 0) / (predsA.length || 1);

        const predsB = reverseAdjacency.get(b.id) || [];
        const centerB =
          predsB.reduce((sum, id) => {
            const pos = positions[id];
            return sum + (pos ? pos.y + pos.height / 2 : 0);
          }, 0) / (predsB.length || 1);

        return centerA - centerB;
      });

      let currentY = startY;
      nodes.forEach((node) => {
        const config = this.getElementConfig(node.type);
        positions[node.id] = {
          x: baseX,
          y: currentY,
          width: config.width,
          height: config.height,
          zIndex: 1,
        };
        currentY += config.height + this.config.nodeSpacing;
      });
    });

    return positions;
  }

  alignSequentialElements(nodes, adjacency, reverseAdjacency, positions) {
    nodes.forEach((node) => {
      const predIds = reverseAdjacency.get(node.id) || [];
      const succIds = adjacency.get(node.id) || [];

      if (predIds.length === 1 && succIds.length === 1) {
        const predPos = positions[predIds[0]];
        const nodePos = positions[node.id];
        const succPos = positions[succIds[0]];

        const isBackEdge = this.backEdges.some(
          (edge) => edge.source === node.id || edge.target === node.id
        );

        if (!isBackEdge && predPos && nodePos && succPos) {
          const predDepth = this.depthMap.get(predIds[0]);
          const nodeDepth = this.depthMap.get(node.id);
          const succDepth = this.depthMap.get(succIds[0]);

          if (predDepth < nodeDepth && nodeDepth < succDepth) {
            nodePos.y = predPos.y + predPos.height / 2 - nodePos.height / 2;
          }
        }
      }
    });
  }

  detectBackEdges(adjacency) {
    const visited = new Set();
    const recStack = new Set();
    const backEdges = [];

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recStack.add(nodeId);

      for (const neighborId of adjacency.get(nodeId) || []) {
        if (!visited.has(neighborId)) {
          dfs(neighborId);
        } else if (recStack.has(neighborId)) {
          backEdges.push({ source: nodeId, target: neighborId });
        }
      }

      recStack.delete(nodeId);
    };

    for (const nodeId of adjacency.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }

    return backEdges;
  }

  adjustGatewayAlignment(nodes, adjacency, reverseAdjacency, positions) {
    if (!this.depthMap) {
      this.depthMap = new Map();
      nodes.forEach((node) => this.depthMap.set(node.id, 0));
    }

    const gateways = nodes
      .filter((node) => /Gateway/i.test(node.type))
      .sort((a, b) => {
        const depthDiff =
          (this.depthMap.get(a.id) || 0) - (this.depthMap.get(b.id) || 0);
        if (depthDiff !== 0) return depthDiff;
        return (positions[a.id]?.x || 0) - (positions[b.id]?.x || 0);
      });

    const visited = new Set();
    const branchRegistry = new Map();

    gateways.forEach((gateway) => {
      if (visited.has(gateway.id)) return;

      const gatewayPos = positions[gateway.id];
      if (!gatewayPos) return;

      const incomingIds = reverseAdjacency.get(gateway.id) || [];

      if (incomingIds.length > 0) {
        const incomingCenters = incomingIds.map((id) => {
          const pos = positions[id];
          return pos
            ? pos.y + pos.height / 2
            : gatewayPos.y + gatewayPos.height / 2;
        });

        const sortedCenters = incomingCenters.sort((a, b) => a - b);
        const medianY = sortedCenters[Math.floor(sortedCenters.length / 2)];
        gatewayPos.y = medianY - gatewayPos.height / 2;
      }

      const outgoingIds = adjacency.get(gateway.id) || [];

      if (outgoingIds.length > 1) {
        const branchSpacing = this.config.nodeSpacing * 2;
        const totalHeight = (outgoingIds.length - 1) * branchSpacing;
        const branchStartY =
          gatewayPos.y + gatewayPos.height / 2 - totalHeight / 2;

        outgoingIds.forEach((targetId, branchIndex) => {
          if (branchRegistry.has(targetId)) return;
          branchRegistry.set(targetId, true);

          const targetNode = nodes.find((n) => n.id === targetId);
          if (!targetNode) return;

          const branchElements = this.collectBranchElements(
            targetNode,
            nodes,
            adjacency,
            reverseAdjacency
          );

          if (branchElements.length === 0) return;

          const branchDepth = this.depthMap.get(targetId) || 0;
          const baseX = this.config.startX + branchDepth * this.config.layerSpacing;

          branchElements.forEach((el) => {
            const elDepth = this.depthMap.get(el.id) || 0;
            const loopLevel = this.loopNestingMap.get(el.id) || 0;
            const adjustedDepth = elDepth + loopLevel;
            const elX = this.config.startX + adjustedDepth * this.config.layerSpacing;

            if (positions[el.id]) {
              positions[el.id].x = elX;
            }
          });

          let branchCenter = 0;
          let validElements = 0;
          branchElements.forEach((el) => {
            const elPos = positions[el.id];
            if (elPos) {
              branchCenter += elPos.y + elPos.height / 2;
              validElements++;
            }
          });
          if (validElements === 0) return;

          branchCenter /= validElements;
          const targetY = branchStartY + branchIndex * branchSpacing;
          const yOffset = targetY - branchCenter;

          branchElements.forEach((el) => {
            const elPos = positions[el.id];
            if (elPos) {
              elPos.y += yOffset;
            }
          });

          branchElements.forEach((el) => {
            if (/Gateway/i.test(el.type) && !visited.has(el.id)) {
              visited.add(el.id);
              this.adjustSubGatewayAlignment(
                el,
                nodes,
                adjacency,
                reverseAdjacency,
                positions
              );
            }
          });
        });
      }

      visited.add(gateway.id);
    });
  }

  identifyBranches(nodes, adjacency) {
    this.branchMap = new Map();
    let branchCounter = 0;
    const visited = new Set();

    const traverse = (nodeId, branchId) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      this.branchMap.set(nodeId, branchId);

      const successors = adjacency.get(nodeId) || [];
      if (successors.length > 1) {
        successors.forEach((succId, idx) => {
          traverse(succId, branchCounter++);
        });
      } else if (successors.length === 1) {
        traverse(successors[0], branchId);
      }
    };

    const startNode = nodes.find((n) => n.type === "startEvent");
    if (startNode) {
      this.branchMap.set(startNode.id, 'main');
      traverse(startNode.id, 'main');
    } else {
      const startNodes = nodes.filter(
        n => (reverseAdjacency.get(n.id) || []).length === 0
      );
      startNodes.forEach(node => traverse(node.id, branchCounter++));
    }
  }

  adjustSubGatewayAlignment(
    gateway,
    nodes,
    adjacency,
    reverseAdjacency,
    positions
  ) {
    const gatewayPos = positions[gateway.id];
    if (!gatewayPos) return;

    const incomingIds = reverseAdjacency.get(gateway.id) || [];
    if (incomingIds.length > 0) {
      const incomingYs = incomingIds.map((id) => {
        const pos = positions[id];
        return pos
          ? pos.y + pos.height / 2
          : gatewayPos.y + gatewayPos.height / 2;
      });
      const avgY =
        incomingYs.reduce((sum, y) => sum + y, 0) / incomingYs.length;
      gatewayPos.y = avgY - gatewayPos.height / 2;
    }

    const outgoingIds = adjacency.get(gateway.id) || [];
    if (outgoingIds.length > 1) {
      const branchSpacing = this.config.nodeSpacing * 2;
      const totalVerticalSpace = (outgoingIds.length - 1) * branchSpacing;
      const startY =
        gatewayPos.y + gatewayPos.height / 2 - totalVerticalSpace / 2;

      outgoingIds.forEach((targetId, index) => {
        const targetNode = nodes.find((n) => n.id === targetId);
        if (!targetNode) return;

        const branchElements = this.collectBranchElements(
          targetNode,
          nodes,
          adjacency,
          reverseAdjacency
        );
        if (branchElements.length === 0) return;

        branchElements.forEach(el => {
          const elDepth = this.depthMap.get(el.id) || 0;
          const loopLevel = this.loopNestingMap.get(el.id) || 0;
          const adjustedDepth = elDepth + loopLevel;
          positions[el.id].x = this.config.startX + adjustedDepth * this.config.layerSpacing;
        });

        let totalCenter = 0;
        branchElements.forEach((el) => {
          const elPos = positions[el.id];
          if (elPos) totalCenter += elPos.y + elPos.height / 2;
        });
        const currentCenter = totalCenter / branchElements.length;
        const targetCenter = startY + index * branchSpacing;
        const deltaY = targetCenter - currentCenter;

        branchElements.forEach((el) => {
          const elPos = positions[el.id];
          if (elPos) elPos.y += deltaY;
        });
      });
    }
  }

  collectBranchElements(startNode, allNodes, adjacency, reverseAdjacency) {
    const branchElements = [];
    const stack = [startNode];
    const visited = new Set();

    while (stack.length > 0) {
      const node = stack.pop();
      if (visited.has(node.id)) continue;
      visited.add(node.id);

      if (node !== startNode) {
        const preds = reverseAdjacency.get(node.id) || [];
        if (preds.length > 1) continue;

        if (/Gateway/i.test(node.type)) {
          branchElements.push(node);
          continue;
        }
      }

      branchElements.push(node);

      const successors = adjacency.get(node.id) || [];
      for (const succId of successors) {
        const succNode = allNodes.find((n) => n.id === succId);
        if (succNode && !visited.has(succId)) {
          stack.push(succNode);
        }
      }
    }

    return branchElements;
  }

  placeBoundaryEvents(boundaryEvents, positions) {
    boundaryEvents.forEach((event) => {
      const parentId =
        event.attachedTo || this.context.boundaryAttachments?.get(event.id);
      const parentPos = positions[parentId];
      const config = this.getElementConfig(event.type);

      positions[event.id] = parentPos
        ? {
          x: parentPos.x,
          y: parentPos.y + parentPos.height - config.height,
          width: config.width,
          height: config.height,
          zIndex: 10,
        }
        : {
          x: this.config.startX,
          y: this.config.startY + 300,
          width: config.width,
          height: config.height,
          zIndex: 10,
        };
    });
  }
}