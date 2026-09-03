import { BOARD_SIZE, PLAYER, orientationFor } from "./src/game.js";

const nodeLimit = Number(process.argv[2] ?? 2_000_000);
const neutralKey = "5,5";

const positions = [];
for (let y = 1; y < BOARD_SIZE - 1; y += 1) {
  for (let x = 1; x < BOARD_SIZE - 1; x += 1) positions.push({ x, y });
}

const positionIndex = new Map(positions.map(({ x, y }, index) => [`${x},${y}`, index]));
const neutralIndex = positionIndex.get(neutralKey);
const neutralBit = 1n << BigInt(neutralIndex);

function buildEdges(player) {
  const nodeIndex = new Map();
  const node = (x, y) => {
    const key = `${x},${y}`;
    if (!nodeIndex.has(key)) nodeIndex.set(key, nodeIndex.size);
    return nodeIndex.get(key);
  };

  const edges = positions.map(({ x, y }) => {
    const orientation = orientationFor(player, x, y);
    const [ax, ay, bx, by] = orientation === "v"
      ? [x, y - 1, x, y + 1]
      : [x - 1, y, x + 1, y];
    return [node(ax, ay), node(bx, by)];
  });
  const source = [];
  const target = [];
  for (const [key, index] of nodeIndex) {
    const [x, y] = key.split(",").map(Number);
    if ((player === PLAYER.RED && y === 0) || (player === PLAYER.IVORY && x === 0)) source.push(index);
    if ((player === PLAYER.RED && y === BOARD_SIZE - 1)
      || (player === PLAYER.IVORY && x === BOARD_SIZE - 1)) target.push(index);
  }
  return { edges, nodeCount: nodeIndex.size, source, target };
}

const topology = {
  [PLAYER.RED]: buildEdges(PLAYER.RED),
  [PLAYER.IVORY]: buildEdges(PLAYER.IVORY),
};

function hasWin(mask, player) {
  const { edges, nodeCount, source, target } = topology[player];
  const parent = Array.from({ length: nodeCount }, (_, index) => index);
  const find = (node) => {
    let current = node;
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]];
      current = parent[current];
    }
    return current;
  };

  for (let index = 0; index < positions.length; index += 1) {
    if (!(mask & (1n << BigInt(index)))) continue;
    const [a, b] = edges[index];
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return true;
    parent[rootA] = rootB;
  }
  return source.some((start) => target.some((end) => find(start) === find(end)));
}

const transforms = [
  (x, y) => [x, y],
  (x, y) => [BOARD_SIZE - 1 - x, y],
  (x, y) => [x, BOARD_SIZE - 1 - y],
  (x, y) => [BOARD_SIZE - 1 - x, BOARD_SIZE - 1 - y],
].map((transform) => positions.map(({ x, y }) => positionIndex.get(transform(x, y).join(","))));

function transformMask(mask, permutation) {
  let transformed = 0n;
  for (let index = 0; index < positions.length; index += 1) {
    if (mask & (1n << BigInt(index))) transformed |= 1n << BigInt(permutation[index]);
  }
  return transformed;
}

function stateKey(red, ivory, activated, player) {
  let best = null;
  for (const permutation of transforms) {
    const candidate = `${transformMask(red, permutation).toString(36)}:${transformMask(ivory, permutation).toString(36)}`;
    if (best === null || candidate < best) best = candidate;
  }
  return `${player}:${activated ? 1 : 0}:${best}`;
}

const memo = new Map();
let nodes = 0;
const SEARCH_LIMIT = Symbol("search-limit");

function solve(red, ivory, activated, player) {
  nodes += 1;
  if (nodes > nodeLimit) throw SEARCH_LIMIT;

  const key = stateKey(red, ivory, activated, player);
  if (memo.has(key)) return memo.get(key);

  const occupied = red | ivory | neutralBit;
  const moves = [];
  for (let index = 0; index < positions.length; index += 1) {
    const bit = 1n << BigInt(index);
    if (!(occupied & bit)) moves.push(bit);
  }
  if (player === PLAYER.IVORY && !activated) moves.push(neutralBit);
  if (!moves.length) {
    memo.set(key, false);
    return false;
  }

  const ownMask = player === PLAYER.RED ? red : ivory;
  const otherPlayer = player === PLAYER.RED ? PLAYER.IVORY : PLAYER.RED;
  const winningMoves = [];
  const remainingMoves = [];
  for (const move of moves) {
    const nextMask = ownMask | move;
    if (hasWin(nextMask, player)) winningMoves.push(move);
    else remainingMoves.push(move);
  }
  if (winningMoves.length) {
    memo.set(key, true);
    return true;
  }

  for (const move of remainingMoves) {
    const nextRed = player === PLAYER.RED ? red | move : red;
    const nextIvory = player === PLAYER.IVORY ? ivory | move : ivory;
    const nextActivated = activated || (player === PLAYER.IVORY && move === neutralBit);
    if (!solve(nextRed, nextIvory, nextActivated, otherPlayer)) {
      memo.set(key, true);
      return true;
    }
  }
  memo.set(key, false);
  return false;
}

let exact = true;
let redWinsFromCenter = null;
try {
  redWinsFromCenter = solve(0n, 0n, false, PLAYER.RED);
} catch (error) {
  if (error !== SEARCH_LIMIT) throw error;
  exact = false;
}
console.log(JSON.stringify({
  neutralBridge: neutralKey,
  nodeLimit,
  searchedNodes: nodes,
  memoizedStates: memo.size,
  exact,
  winner: exact ? redWinsFromCenter ? "red" : "ivory" : "unknown",
}));
