import {
  BOARD_SIZE,
  PLAYER,
  allLegalMoves,
  allNeutralMoves,
  neighbours,
  orientationFor,
  parseMove,
  playMove,
} from "./game.js";

const WIN_SCORE = 100000;
const PERFECT_OPENING = "5,9,v";

// Two edge-disjoint spanning trees for the five-link Red graph. Boundary
// edges are duplicated in both trees; claiming an edge duplicates it too.
const TREE_A = [
  "6,2,h", "B5:1", "6,4,h", "B5:0", "1,7,v", "2,2,h", "3,1,v",
  "1,3,v", "B0:3", "B0:1", "B5:3", "7,3,v", PERFECT_OPENING,
  "6,6,h", "1,5,v", "1,9,v", "6,8,h", "4,8,h", "9,9,v", "3,7,v",
  "B0:0", "3,3,v", "5,1,v", "9,5,v", "B0:2", "B5:2", "9,7,v",
  "8,2,h", "5,5,v",
];
const TREE_B = [
  "B0:0", "B0:1", "B0:2", "B0:3", "B5:0", "B5:1", "B5:2", "B5:3",
  "1,1,v", "7,1,v", "9,1,v", "5,3,v", "9,3,v", "3,5,v", "7,5,v",
  "5,7,v", "7,7,v", "3,9,v", PERFECT_OPENING, "7,9,v", "4,2,h",
  "2,4,h", "4,4,h", "8,4,h", "2,6,h", "4,6,h", "8,6,h", "2,8,h",
  "8,8,h",
];

function otherPlayer(player) {
  return player === PLAYER.RED ? PLAYER.IVORY : PLAYER.RED;
}

function positionKey(key) {
  const { x, y } = parseMove(key);
  return `${x},${y}`;
}

function redLineAt(key) {
  const { x, y } = parseMove(key);
  return `${x},${y},${orientationFor(PLAYER.RED, x, y)}`;
}

function edgeNodes(edge) {
  if (edge.startsWith("B")) {
    const [row, column] = edge.slice(1).split(":").map(Number);
    const y = row === 0 ? 0 : BOARD_SIZE - 1;
    return [`${column * 2 + 1},${y}`, `${column * 2 + 3},${y}`];
  }
  const { x, y, orientation } = parseMove(edge);
  return orientation === "h"
    ? [`${x - 1},${y}`, `${x + 1},${y}`]
    : [`${x},${y - 1}`, `${x},${y + 1}`];
}

function treeComponents(edges) {
  const adjacency = new Map();
  for (let row = 0; row <= 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      adjacency.set(`${column * 2 + 1},${row * 2}`, []);
    }
  }
  for (const edge of edges) {
    const [a, b] = edgeNodes(edge);
    adjacency.get(a).push(b);
    adjacency.get(b).push(a);
  }
  const component = new Map();
  let componentId = 0;
  for (const start of adjacency.keys()) {
    if (component.has(start)) continue;
    const queue = [start];
    component.set(start, componentId);
    while (queue.length) {
      const current = queue.shift();
      for (const next of adjacency.get(current)) {
        if (component.has(next)) continue;
        component.set(next, componentId);
        queue.push(next);
      }
    }
    componentId += 1;
  }
  return { component, count: componentId };
}

export function choosePerfectRedMove(game) {
  if (game.currentPlayer !== PLAYER.RED || game.winner) return null;
  if (game.neutralBridge) return null;
  if (game.history.length === 0) return PERFECT_OPENING;
  if (game.history[0] !== PERFECT_OPENING) return null;

  const treeA = new Set(TREE_A);
  const treeB = new Set(TREE_B);
  for (let index = 1; index < game.history.length; index += 1) {
    const move = redLineAt(game.history[index]);
    if (index % 2 === 1) {
      treeA.delete(move);
      treeB.delete(move);
    } else if (treeA.has(move) && !treeB.has(move)) {
      treeB.add(move);
    } else if (treeB.has(move) && !treeA.has(move)) {
      treeA.add(move);
    }
  }

  const stateA = treeComponents(treeA);
  const stateB = treeComponents(treeB);
  const broken = stateA.count > 1 ? stateA : stateB.count > 1 ? stateB : null;
  const intact = broken === stateA ? treeB : treeA;
  if (!broken) return null;

  const legal = new Set(allLegalMoves(game.board, PLAYER.RED));
  for (const edge of intact) {
    if (!legal.has(edge)) continue;
    const [a, b] = edgeNodes(edge);
    if (broken.component.get(a) !== broken.component.get(b)) return edge;
  }
  return null;
}

// The central neutral bridge is White's pre-game deletion of Red's crossing
// at (5,5). Rebuild the same paired-tree invariant around that deletion:
// Red's first edge must reconnect the damaged tree using an edge from its
// intact partner, then every later White crossing is answered by the usual
// repair move. This preserves the Shannon-game strategy after the variant.
export function choosePerfectRedGoldMove(game) {
  if (game.currentPlayer !== PLAYER.RED || game.winner || game.neutralBridge !== "5,5,n") return null;

  const treeA = new Set(TREE_A);
  const treeB = new Set(TREE_B);
  treeA.delete("5,5,v");

  for (let index = 0; index < game.history.length; index += 1) {
    const move = redLineAt(game.history[index]);
    if (index % 2 === 0) {
      if (treeA.has(move) && !treeB.has(move)) treeB.add(move);
      else if (treeB.has(move) && !treeA.has(move)) treeA.add(move);
    } else {
      treeA.delete(move);
      treeB.delete(move);
    }
  }

  const stateA = treeComponents(treeA);
  const stateB = treeComponents(treeB);
  const broken = stateA.count > 1 ? stateA : stateB.count > 1 ? stateB : null;
  const intact = broken === stateA ? treeB : treeA;
  if (!broken) return null;

  const legal = new Set(allLegalMoves(game.board, PLAYER.RED));
  const repairs = [...intact]
    .filter((edge) => !edge.startsWith("B") && legal.has(edge))
    .filter((edge) => {
      const [a, b] = edgeNodes(edge);
      return broken.component.get(a) !== broken.component.get(b);
    })
    .sort((a, b) => movePriority(game, b, PLAYER.RED, true)
      - movePriority(game, a, PLAYER.RED, true));
  return repairs[0] ?? null;
}

export function chooseRedGoldCounterOpening(game) {
  if (game.currentPlayer !== PLAYER.RED || game.history.length || !game.neutralBridge) return null;
  const gold = parseMove(game.neutralBridge);
  const whiteOrientation = orientationFor(PLAYER.IVORY, gold.x, gold.y);
  const positions = whiteOrientation === "h"
    ? [[gold.x - 2, gold.y], [gold.x + 2, gold.y]]
    : [[gold.x, gold.y - 2], [gold.x, gold.y + 2]];
  const legal = new Set(allLegalMoves(game.board, PLAYER.RED));
  const candidates = positions
    .map(([x, y]) => {
      const orientation = orientationFor(PLAYER.RED, x, y);
      return orientation ? `${x},${y},${orientation}` : null;
    })
    .filter((move) => move && legal.has(move));
  candidates.sort((a, b) => movePriority(game, b, PLAYER.RED, true)
    - movePriority(game, a, PLAYER.RED, true));
  return candidates[0] ?? null;
}

export function chooseWhiteGoldHookReply(game) {
  if (game.currentPlayer !== PLAYER.IVORY || game.history.length !== 1 || !game.neutralBridge) return null;
  const gold = parseMove(game.neutralBridge);
  const whiteOrientation = orientationFor(PLAYER.IVORY, gold.x, gold.y);
  const center = (BOARD_SIZE - 1) / 2;
  const legal = new Set(allLegalMoves(game.board, PLAYER.IVORY));
  const straightPositions = whiteOrientation === "h"
    ? [[gold.x - 2, gold.y], [gold.x + 2, gold.y]]
    : [[gold.x, gold.y - 2], [gold.x, gold.y + 2]];
  const straightCandidates = straightPositions
    .map(([x, y]) => {
      const orientation = orientationFor(PLAYER.IVORY, x, y);
      return orientation ? `${x},${y},${orientation}` : null;
    })
    .filter((move) => move && legal.has(move));
  if (straightCandidates.length) {
    straightCandidates.sort((a, b) => movePriority(game, b, PLAYER.IVORY, true)
      - movePriority(game, a, PLAYER.IVORY, true));
    return straightCandidates[0];
  }

  let positions;
  if (whiteOrientation === "h") {
    const innerX = gold.x + (gold.x < center ? 1 : -1);
    positions = [[innerX, gold.y - 1], [innerX, gold.y + 1]];
  } else {
    const innerY = gold.y + (gold.y < center ? 1 : -1);
    positions = [[gold.x - 1, innerY], [gold.x + 1, innerY]];
  }
  const candidates = positions
    .map(([x, y]) => {
      const orientation = orientationFor(PLAYER.IVORY, x, y);
      return orientation ? `${x},${y},${orientation}` : null;
    })
    .filter((move) => move && legal.has(move));
  candidates.sort((a, b) => movePriority(game, b, PLAYER.IVORY, true)
    - movePriority(game, a, PLAYER.IVORY, true));
  return candidates[0] ?? null;
}

function possibleLines(player) {
  const lines = [];
  for (let y = 1; y < BOARD_SIZE - 1; y += 1) {
    for (let x = 1; x < BOARD_SIZE - 1; x += 1) {
      const orientation = orientationFor(player, x, y);
      if (orientation) lines.push(`${x},${y},${orientation}`);
    }
  }
  return lines;
}

function buildLineTopology(player) {
  const lines = possibleLines(player);
  const lineIndex = new Map(lines.map((line, index) => [line, index]));
  const adjacent = lines.map((line) => neighbours(line)
    .map((neighbour) => lineIndex.get(neighbour))
    .filter((index) => index !== undefined));
  const sources = [];
  const targets = [];
  lines.forEach((line, index) => {
    const move = parseMove(line);
    const source = player === PLAYER.RED
      ? move.orientation === "v" && move.y === 1
      : move.orientation === "h" && move.x === 1;
    const target = player === PLAYER.RED
      ? move.orientation === "v" && move.y === BOARD_SIZE - 2
      : move.orientation === "h" && move.x === BOARD_SIZE - 2;
    if (source) sources.push(index);
    if (target) targets.push(index);
  });
  return {
    lines,
    positions: lines.map(positionKey),
    adjacent,
    sources,
    targets,
  };
}

const LINE_TOPOLOGY = {
  [PLAYER.RED]: buildLineTopology(PLAYER.RED),
  [PLAYER.IVORY]: buildLineTopology(PLAYER.IVORY),
};

function boardOwnerMap(board) {
  return new Map([...board].map(([key, owner]) => [positionKey(key), owner]));
}

function connectionInfo(board, player, occupied = boardOwnerMap(board)) {
  const topology = LINE_TOPOLOGY[player];
  const count = topology.lines.length;
  const distance = new Float64Array(count);
  const visited = new Uint8Array(count);
  distance.fill(Infinity);

  const weight = (index) => {
    const owner = occupied.get(topology.positions[index]);
    if (owner === player) return 0;
    // White owns the right to activate this crossing, so it is more reliable
    // than an ordinary empty edge even though activation still costs a move.
    if (owner === PLAYER.NEUTRAL && player === PLAYER.IVORY) return 0.4;
    if (owner !== undefined) return Infinity;
    return 1;
  };

  for (const source of topology.sources) distance[source] = weight(source);
  for (let iteration = 0; iteration < count; iteration += 1) {
    let current = -1;
    let currentDistance = Infinity;
    for (let index = 0; index < count; index += 1) {
      if (!visited[index] && distance[index] < currentDistance) {
        current = index;
        currentDistance = distance[index];
      }
    }
    if (current < 0 || currentDistance === Infinity) break;
    visited[current] = 1;
    for (const next of topology.adjacent[current]) {
      if (visited[next]) continue;
      const nextWeight = weight(next);
      const candidate = currentDistance + nextWeight;
      if (candidate < distance[next]) distance[next] = candidate;
    }
  }
  const targets = topology.targets.map((index) => distance[index]);
  const bestTargets = [...targets].sort((a, b) => a - b).slice(0, 3);
  return {
    min: Math.min(...targets, 20),
    sum: bestTargets.reduce((total, value) => total + Math.min(value, 20), 0),
    openTargets: targets.filter((value) => value < Infinity).length,
  };
}

function networkStrength(board, player, occupied = boardOwnerMap(board)) {
  const topology = LINE_TOPOLOGY[player];
  let score = 0;
  topology.positions.forEach((position, index) => {
    if (occupied.get(position) !== player) return;
    for (const neighbour of topology.adjacent[index]) {
      if (occupied.get(topology.positions[neighbour]) === player) score += 1;
    }
  });
  return score;
}

function buildElectricalTopology(player) {
  const nodeIndex = new Map();
  const edges = [];
  const getNode = (node) => {
    if (!nodeIndex.has(node)) nodeIndex.set(node, nodeIndex.size);
    return nodeIndex.get(node);
  };
  for (const line of possibleLines(player)) {
    const [start, end] = edgeNodes(line);
    edges.push({ a: getNode(start), b: getNode(end), position: positionKey(line) });
  }
  const sources = new Set();
  const targets = new Set();
  for (const [node, index] of nodeIndex) {
    const [x, y] = node.split(",").map(Number);
    if (player === PLAYER.RED) {
      if (y === 0) sources.add(index);
      if (y === BOARD_SIZE - 1) targets.add(index);
    } else {
      if (x === 0) sources.add(index);
      if (x === BOARD_SIZE - 1) targets.add(index);
    }
  }
  const adjacency = Array.from({ length: nodeIndex.size }, () => []);
  edges.forEach((edge, edgeIndex) => {
    adjacency[edge.a].push(edgeIndex);
    adjacency[edge.b].push(edgeIndex);
  });
  return { edges, adjacency, sources, targets, nodeIndex, nodeCount: nodeIndex.size };
}

const ELECTRICAL_TOPOLOGY = {
  [PLAYER.RED]: buildElectricalTopology(PLAYER.RED),
  [PLAYER.IVORY]: buildElectricalTopology(PLAYER.IVORY),
};

function connectionConductance(board, player) {
  const topology = ELECTRICAL_TOPOLOGY[player];
  const occupied = new Map([...board].map(([key, owner]) => [positionKey(key), owner]));
  const conductance = topology.edges.map(({ position }) => {
    const owner = occupied.get(position);
    if (owner === player) return 10;
    if (owner === PLAYER.NEUTRAL && player === PLAYER.IVORY) return 2.5;
    if (owner === undefined) return 1;
    return 0;
  });
  const voltage = new Float64Array(topology.nodeCount).fill(0.5);
  topology.sources.forEach((node) => { voltage[node] = 1; });
  topology.targets.forEach((node) => { voltage[node] = 0; });

  for (let iteration = 0; iteration < 14; iteration += 1) {
    for (let node = 0; node < topology.nodeCount; node += 1) {
      if (topology.sources.has(node) || topology.targets.has(node)) continue;
      let weightedVoltage = 0;
      let totalConductance = 0;
      for (const edgeIndex of topology.adjacency[node]) {
        const edgeConductance = conductance[edgeIndex];
        if (edgeConductance === 0) continue;
        const edge = topology.edges[edgeIndex];
        const neighbour = edge.a === node ? edge.b : edge.a;
        weightedVoltage += edgeConductance * voltage[neighbour];
        totalConductance += edgeConductance;
      }
      if (totalConductance > 0) voltage[node] = weightedVoltage / totalConductance;
    }
  }

  let current = 0;
  topology.sources.forEach((source) => {
    for (const edgeIndex of topology.adjacency[source]) {
      const edge = topology.edges[edgeIndex];
      const neighbour = edge.a === source ? edge.b : edge.a;
      if (topology.sources.has(neighbour)) continue;
      current += conductance[edgeIndex] * Math.max(0, 1 - voltage[neighbour]);
    }
  });
  return Math.log1p(current);
}

function redSpanningResilience(board) {
  const topology = ELECTRICAL_TOPOLOGY[PLAYER.RED];
  const occupied = boardOwnerMap(board);
  const edges = [];
  for (const y of [0, BOARD_SIZE - 1]) {
    for (let x = 1; x < BOARD_SIZE - 2; x += 2) {
      const a = topology.nodeIndex.get(`${x},${y}`);
      const b = topology.nodeIndex.get(`${x + 2},${y}`);
      edges.push({ a, b }, { a, b });
    }
  }
  for (const edge of topology.edges) {
    const owner = occupied.get(edge.position);
    const copies = owner === PLAYER.RED ? 2 : owner === undefined ? 1 : 0;
    for (let copy = 0; copy < copies; copy += 1) edges.push({ a: edge.a, b: edge.b });
  }

  const trialMultipliers = [1, 7, 13, 19, 29, 37, 43, 53];
  let best = 0;
  trialMultipliers.forEach((multiplier, trial) => {
    const order = edges
      .map((edge, index) => ({ edge, key: ((index + 3) * multiplier + trial * 17) % 97 }))
      .sort((a, b) => a.key - b.key);
    const parents = [
      Array.from({ length: topology.nodeCount }, (_, index) => index),
      Array.from({ length: topology.nodeCount }, (_, index) => index),
    ];
    const counts = [0, 0];
    const find = (forest, node) => {
      let current = node;
      while (parents[forest][current] !== current) {
        parents[forest][current] = parents[forest][parents[forest][current]];
        current = parents[forest][current];
      }
      return current;
    };
    for (const { edge } of order) {
      const canUse = [0, 1].filter((forest) => find(forest, edge.a) !== find(forest, edge.b));
      if (!canUse.length) continue;
      const forest = canUse.length === 1
        ? canUse[0]
        : counts[0] <= counts[1] ? 0 : 1;
      parents[forest][find(forest, edge.a)] = find(forest, edge.b);
      counts[forest] += 1;
    }
    best = Math.max(best, Math.min(...counts) * 100 + counts[0] + counts[1]);
  });
  return best;
}

function evaluatePosition(game, computer) {
  if (game.winner) {
    return game.winner.player === computer ? WIN_SCORE : -WIN_SCORE;
  }
  const opponent = otherPlayer(computer);
  const occupied = boardOwnerMap(game.board);
  const computerConnection = connectionInfo(game.board, computer, occupied);
  const opponentConnection = connectionInfo(game.board, opponent, occupied);
  const network = networkStrength(game.board, computer, occupied)
    - networkStrength(game.board, opponent, occupied);
  const distanceScore = (opponentConnection.min - computerConnection.min) * 620;
  const breadthScore = (opponentConnection.sum - computerConnection.sum) * 20;
  const accessScore = (computerConnection.openTargets - opponentConnection.openTargets) * 25;
  const tempo = game.currentPlayer === computer ? 8 : -8;
  return distanceScore + breadthScore + accessScore + network * 22 + tempo;
}

function movePriority(game, move, player, strategic = false) {
  const { x, y } = parseMove(move);
  const next = playMove({ ...game, currentPlayer: player }, move);
  if (next.winner?.player === player) return WIN_SCORE;

  const ownNeighbours = neighbours(move)
    .filter((candidate) => game.board.get(candidate) === player)
    .length;
  const reservedBridgeBonus = player === PLAYER.IVORY
    && game.neutralBridge
    && positionKey(move) === positionKey(game.neutralBridge)
    ? ownNeighbours > 0 ? 85 : 5
    : 0;
  const center = (BOARD_SIZE - 1) / 2;
  const centerDistance = Math.abs(x - center) + Math.abs(y - center);
  let priority = ownNeighbours * 30 + reservedBridgeBonus - centerDistance;
  if (strategic) {
    const opponent = otherPlayer(player);
    const ownConnection = connectionInfo(next.board, player);
    const opponentConnection = connectionInfo(next.board, opponent);
    const ownConductance = connectionConductance(next.board, player);
    const opponentConductance = connectionConductance(next.board, opponent);
    const redResilience = player === PLAYER.RED ? redSpanningResilience(next.board) : 0;
    priority += (20 - ownConnection.min) * 90
      + opponentConnection.min * 45
      + (ownConductance - opponentConductance) * 80
      + redResilience * 0.12;
  }
  return priority;
}

function orderedMoves(game, player, limit = Infinity, strategic = false) {
  return allLegalMoves(game.board, player)
    .map((move) => ({ move, priority: movePriority(game, move, player, strategic) }))
    .sort((a, b) => b.priority - a.priority || a.move.localeCompare(b.move))
    .slice(0, limit)
    .map(({ move }) => move);
}

const SEARCH_TIMEOUT = Symbol("search-timeout");

function stateKey(game) {
  return `${game.currentPlayer}|${[...game.board]
    .map(([key, owner]) => `${positionKey(key)}:${owner}`)
    .sort()
    .join(";")}`;
}

function winningMoves(game, player, limit = Infinity) {
  const probe = { ...game, currentPlayer: player, winner: null };
  const wins = [];
  for (const move of allLegalMoves(game.board, player)) {
    if (playMove(probe, move).winner?.player === player) {
      wins.push(move);
      if (wins.length >= limit) break;
    }
  }
  return wins;
}

function createsFork(game, player) {
  return winningMoves(game, player, 2).length >= 2;
}

// In an edge Shannon game, allowing the opponent to create two independent
// one-move connections is equivalent to conceding the next exchange. Screen
// these at the root before heuristic search can prune their blocking edge.
export function allowsOpponentFork(game, move, player = game.currentPlayer) {
  const afterMove = playMove({ ...game, currentPlayer: player }, move);
  if (afterMove.winner) return false;

  const opponent = otherPlayer(player);
  for (const reply of allLegalMoves(afterMove.board, opponent)) {
    const afterReply = playMove(afterMove, reply);
    if (afterReply.winner?.player === opponent || createsFork(afterReply, opponent)) return true;
  }
  return false;
}

function search(game, depth, alpha, beta, computer, context, ply = 0) {
  context.nodes += 1;
  if ((context.nodes & 31) === 0 && Date.now() >= context.deadline) throw SEARCH_TIMEOUT;
  if (game.winner) {
    return game.winner.player === computer ? WIN_SCORE - ply : -WIN_SCORE + ply;
  }
  if (depth === 0) return evaluatePosition(game, computer);

  const key = stateKey(game);
  const originalAlpha = alpha;
  const originalBeta = beta;
  const cached = context.table.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.flag === "exact") return cached.value;
    if (cached.flag === "lower") alpha = Math.max(alpha, cached.value);
    if (cached.flag === "upper") beta = Math.min(beta, cached.value);
    if (alpha >= beta) return cached.value;
  }

  const maximizing = game.currentPlayer === computer;
  const legalCount = allLegalMoves(game.board, game.currentPlayer).length;
  // Tactical wins and mandatory blocks are handled before these beam limits.
  // Narrower deeper plies buy one extra full move of lookahead on mobile.
  const beamWidth = legalCount <= 12 ? Infinity : ply <= 1 ? 14 : ply === 2 ? 10 : 8;
  let moves = orderedMoves(game, game.currentPlayer, beamWidth, ply <= 1);

  if (depth === 1 || legalCount <= 18) {
    const ownWins = winningMoves(game, game.currentPlayer, 1);
    if (ownWins.length) {
      return maximizing ? WIN_SCORE - ply - 1 : -WIN_SCORE + ply + 1;
    }
    const opponent = otherPlayer(game.currentPlayer);
    const opponentWins = winningMoves(game, opponent, 2);
    if (opponentWins.length > 1) {
      return maximizing ? -WIN_SCORE + ply + 2 : WIN_SCORE - ply - 2;
    }
    if (opponentWins.length === 1) {
      const threatenedPosition = positionKey(opponentWins[0]);
      moves = moves.filter((move) => positionKey(move) === threatenedPosition);
      if (!moves.length) return maximizing ? -WIN_SCORE + ply + 2 : WIN_SCORE - ply - 2;
    }
  }

  const preferredMoves = [cached?.bestMove, context.killers[ply]].filter(Boolean);
  for (const preferred of preferredMoves.reverse()) {
    const index = moves.indexOf(preferred);
    if (index > 0) moves.unshift(...moves.splice(index, 1));
  }

  let bestMove = moves[0] ?? null;
  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      const childValue = search(playMove(game, move), depth - 1, alpha, beta, computer, context, ply + 1);
      if (childValue > value) {
        value = childValue;
        bestMove = move;
      }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) {
        context.killers[ply] = move;
        break;
      }
    }
    context.table.set(key, {
      depth,
      value,
      bestMove,
      flag: value <= originalAlpha ? "upper" : value >= originalBeta ? "lower" : "exact",
    });
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    const childValue = search(playMove(game, move), depth - 1, alpha, beta, computer, context, ply + 1);
    if (childValue < value) {
      value = childValue;
      bestMove = move;
    }
    beta = Math.min(beta, value);
    if (alpha >= beta) {
      context.killers[ply] = move;
      break;
    }
  }
  context.table.set(key, {
    depth,
    value,
    bestMove,
    flag: value <= originalAlpha ? "upper" : value >= originalBeta ? "lower" : "exact",
  });
  return value;
}

function createSearchContext(timeLimit) {
  return {
    deadline: Date.now() + timeLimit,
    nodes: 0,
    table: new Map(),
    killers: [],
  };
}

let lastSearchStats = { depth: 0, nodes: 0, elapsedMs: 0 };

export function getLastSearchStats() {
  return { ...lastSearchStats };
}

function searchBestMove(game, computer, minimumDepth = 3, timeLimit = 2000, initialCandidates = null) {
  const startedAt = Date.now();
  let candidates = initialCandidates ?? orderedMoves(game, computer, Infinity, true);
  let bestMove = candidates[0] ?? null;
  let completedDepth = 0;
  const remaining = candidates.length;
  const targetDepth = Math.max(
    minimumDepth,
    remaining >= 34 ? 4 : remaining >= 24 ? 5 : remaining >= 15 ? 6 : Math.min(8, remaining),
  );
  const context = createSearchContext(timeLimit);

  for (let depth = 1; depth <= targetDepth; depth += 1) {
    const iteration = [];
    let alpha = -Infinity;
    try {
      for (const move of candidates) {
        const score = search(
          playMove(game, move),
          depth - 1,
          alpha,
          Infinity,
          computer,
          context,
          1,
        );
        iteration.push({ move, score });
        alpha = Math.max(alpha, score);
      }
    } catch (error) {
      if (error !== SEARCH_TIMEOUT) throw error;
      break;
    }

    iteration.sort((a, b) => b.score - a.score || a.move.localeCompare(b.move));
    if (iteration.length) {
      bestMove = iteration[0].move;
      candidates = iteration.map(({ move }) => move);
      completedDepth = depth;
    }
    if (Math.abs(iteration[0]?.score ?? 0) >= WIN_SCORE - 50) break;
  }
  lastSearchStats = {
    depth: completedDepth,
    nodes: context.nodes,
    elapsedMs: Date.now() - startedAt,
  };
  return bestMove;
}

export function chooseNeutralBridge(game) {
  const legalMoves = allNeutralMoves(game.board);
  const centralBridge = `${(BOARD_SIZE - 1) / 2},${(BOARD_SIZE - 1) / 2},n`;
  if (legalMoves.includes(centralBridge)) return centralBridge;
  const candidates = [];
  for (const move of legalMoves) {
    const board = new Map(game.board);
    board.set(move, PLAYER.NEUTRAL);
    let position = { ...game, board, neutralBridge: move };
    const redOpening = chooseRedGoldCounterOpening(position);
    if (redOpening) position = playMove(position, redOpening);
    const whiteReply = chooseWhiteGoldHookReply(position);
    if (whiteReply) position = playMove(position, whiteReply);
    candidates.push({
      move,
      position,
      score: evaluatePosition(position, PLAYER.IVORY),
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.move.localeCompare(b.move));

  let bestMove = candidates[0]?.move ?? null;
  let bestScore = -Infinity;
  const context = createSearchContext(1200);
  for (const candidate of candidates.slice(0, 8)) {
    try {
      const score = search(
        candidate.position,
        2,
        -Infinity,
        Infinity,
        PLAYER.IVORY,
        context,
      );
      if (score > bestScore) {
        bestScore = score;
        bestMove = candidate.move;
      }
    } catch (error) {
      if (error === SEARCH_TIMEOUT) break;
      throw error;
    }
  }
  return bestMove;
}

export function chooseComputerMove(game, depth = 3) {
  if (game.winner) return null;
  const computer = game.currentPlayer;
  const opponent = otherPlayer(computer);
  const legalMoves = allLegalMoves(game.board, computer);

  for (const move of legalMoves) {
    if (playMove(game, move).winner?.player === computer) return move;
  }
  const goldCounterOpening = chooseRedGoldCounterOpening(game);
  const perfectGoldMove = choosePerfectRedGoldMove(game);
  if (perfectGoldMove && legalMoves.includes(perfectGoldMove)) return perfectGoldMove;
  if (goldCounterOpening) return goldCounterOpening;
  const goldHookReply = chooseWhiteGoldHookReply(game);
  if (goldHookReply) return goldHookReply;
  const perfectMove = choosePerfectRedMove(game);
  if (perfectMove && legalMoves.includes(perfectMove)) return perfectMove;

  const opponentThreats = new Set(winningMoves(game, opponent).map(positionKey));
  const blockingMoves = legalMoves.filter((move) => opponentThreats.has(positionKey(move)));
  if (blockingMoves.length === 1) return blockingMoves[0];

  for (const move of legalMoves) {
    const next = playMove(game, move);
    const futureWins = winningMoves(next, computer, 2);
    if (futureWins.length >= 2 && opponentThreats.size === 0) return move;
  }

  const safeCandidates = orderedMoves(game, computer, Infinity, true)
    .filter((move) => !allowsOpponentFork(game, move, computer));
  return searchBestMove(game, computer, depth, 2000, safeCandidates.length ? safeCandidates : null);
}
