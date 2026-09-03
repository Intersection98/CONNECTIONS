// The physical 1991 edition uses five playable links across each direction:
// 11 render coordinates = 6 edge pegs and 5 connecting positions.
export const BOARD_SIZE = 11;
export const PLAYER = Object.freeze({ NEUTRAL: 0, RED: 1, IVORY: 2 });

export function moveKey(x, y, orientation) {
  return `${x},${y},${orientation}`;
}

export function parseMove(key) {
  const [x, y, orientation] = key.split(",");
  return { x: Number(x), y: Number(y), orientation };
}

export function orientationFor(player, x, y) {
  if (x % 2 !== y % 2 || x < 1 || y < 1 || x >= BOARD_SIZE - 1 || y >= BOARD_SIZE - 1) {
    return null;
  }
  return (player === PLAYER.RED) === (y % 2 === 0) ? "h" : "v";
}

export function legalMoveAt(board, player, x, y) {
  const orientation = orientationFor(player, x, y);
  if (!orientation) return null;
  const occupied = [...board].find(([key]) => {
    const move = parseMove(key);
    return move.x === x && move.y === y;
  });
  if (!occupied || (occupied[1] === PLAYER.NEUTRAL && player === PLAYER.IVORY)) {
    return moveKey(x, y, orientation);
  }
  return null;
}

export function allLegalMoves(board, player) {
  const moves = [];
  for (let y = 1; y < BOARD_SIZE - 1; y += 1) {
    for (let x = 1; x < BOARD_SIZE - 1; x += 1) {
      const move = legalMoveAt(board, player, x, y);
      if (move) moves.push(move);
    }
  }
  return moves;
}

export function allNeutralMoves(board) {
  const moves = [];
  for (let y = 1; y < BOARD_SIZE - 1; y += 1) {
    for (let x = 1; x < BOARD_SIZE - 1; x += 1) {
      if (x % 2 !== y % 2) continue;
      const occupied = [...board.keys()].some((key) => {
        const move = parseMove(key);
        return move.x === x && move.y === y;
      });
      if (!occupied) moves.push(moveKey(x, y, "n"));
    }
  }
  return moves;
}

export function endpoints(key) {
  const { x, y, orientation } = parseMove(key);
  return orientation === "h"
    ? [{ x: x - 1, y }, { x: x + 1, y }]
    : [{ x, y: y - 1 }, { x, y: y + 1 }];
}

export function neighbours(key) {
  const { x, y, orientation } = parseMove(key);
  const candidates = [];
  if (orientation === "h") {
    candidates.push([x - 2, y, "h"], [x + 2, y, "h"]);
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) candidates.push([x + dx, y + dy, "v"]);
    }
  } else {
    candidates.push([x, y - 2, "v"], [x, y + 2, "v"]);
    for (const dx of [-1, 1]) {
      for (const dy of [-1, 1]) candidates.push([x + dx, y + dy, "h"]);
    }
  }
  return candidates
    .filter(([cx, cy]) => cx >= 1 && cy >= 1 && cx < BOARD_SIZE - 1 && cy < BOARD_SIZE - 1)
    .map(([cx, cy, direction]) => moveKey(cx, cy, direction));
}

function playerGraph(board, player) {
  const nodes = new Set([...board].filter(([, owner]) => owner === player).map(([key]) => key));
  const graph = new Map();
  for (const key of nodes) {
    graph.set(key, neighbours(key).filter((candidate) => nodes.has(candidate)));
  }
  return graph;
}

function reconstructPath(previous, end) {
  const path = [end];
  while (previous.has(path[0])) path.unshift(previous.get(path[0]));
  return path;
}

function connectionPath(board, player) {
  const graph = playerGraph(board, player);
  const sources = [];
  const isTarget = player === PLAYER.RED
    ? (key) => parseMove(key).orientation === "v" && parseMove(key).y === BOARD_SIZE - 2
    : (key) => parseMove(key).orientation === "h" && parseMove(key).x === BOARD_SIZE - 2;

  for (const key of graph.keys()) {
    const move = parseMove(key);
    if (player === PLAYER.RED && move.orientation === "v" && move.y === 1) sources.push(key);
    if (player === PLAYER.IVORY && move.orientation === "h" && move.x === 1) sources.push(key);
  }

  const queue = [...sources];
  const visited = new Set(queue);
  const previous = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (isTarget(current)) return reconstructPath(previous, current);
    for (const next of graph.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      previous.set(next, current);
      queue.push(next);
    }
  }
  return null;
}

function cyclePath(board, player, lastMove) {
  const graph = playerGraph(board, player);
  if (!graph.has(lastMove)) return null;

  // The graph is a line graph. Excluding the previous segment's neighbours
  // prevents three segments meeting at one peg from being mistaken for a loop.
  const walk = (current, path, previousNeighbours = []) => {
    const currentNeighbours = graph.get(current) ?? [];
    for (const next of currentNeighbours) {
      if (previousNeighbours.includes(next)) continue;
      if (next === lastMove && path.length > 2) return [...path];
      if (path.includes(next)) continue;
      const cycle = walk(next, [...path, next], currentNeighbours);
      if (cycle) return cycle;
    }
    return null;
  };

  return walk(lastMove, [lastMove]);
}

export function evaluateWin(board, player, lastMove) {
  const path = connectionPath(board, player);
  if (path) return { player, reason: "connection", path };
  const cycle = cyclePath(board, player, lastMove);
  if (cycle) return { player, reason: "loop", path: cycle };
  return null;
}

export function createGame() {
  return {
    board: new Map(),
    currentPlayer: PLAYER.RED,
    history: [],
    neutralBridge: null,
    winner: null,
    lastMove: null,
  };
}

export function forfeitBlockedPlayer(game) {
  if (game.winner || allLegalMoves(game.board, game.currentPlayer).length) return game;
  return {
    ...game,
    winner: {
      player: game.currentPlayer === PLAYER.RED ? PLAYER.IVORY : PLAYER.RED,
      reason: "blocked",
      path: [],
    },
  };
}

export function placeNeutralBridge(game, key) {
  if (game.neutralBridge || game.history.length || !allNeutralMoves(game.board).includes(key)) return game;
  const board = new Map(game.board);
  board.set(key, PLAYER.NEUTRAL);
  return {
    ...game,
    board,
    neutralBridge: key,
    lastMove: key,
  };
}

export function playMove(game, key) {
  if (game.winner || !allLegalMoves(game.board, game.currentPlayer).includes(key)) return game;
  const board = new Map(game.board);
  if (game.neutralBridge) {
    const neutral = parseMove(game.neutralBridge);
    const move = parseMove(key);
    if (neutral.x === move.x && neutral.y === move.y) board.delete(game.neutralBridge);
  }
  board.set(key, game.currentPlayer);
  const win = evaluateWin(board, game.currentPlayer, key);
  const nextPlayer = game.currentPlayer === PLAYER.RED ? PLAYER.IVORY : PLAYER.RED;
  const nextGame = {
    board,
    currentPlayer: win ? game.currentPlayer : nextPlayer,
    history: [...game.history, key],
    neutralBridge: game.neutralBridge,
    winner: win,
    lastMove: key,
  };
  return win ? nextGame : forfeitBlockedPlayer(nextGame);
}

export function undoMove(game) {
  if (!game.history.length) return game;
  const history = game.history.slice(0, -1);
  const board = new Map(game.neutralBridge ? [[game.neutralBridge, PLAYER.NEUTRAL]] : []);
  history.forEach((key, index) => {
    if (game.neutralBridge) {
      const neutral = parseMove(game.neutralBridge);
      const move = parseMove(key);
      if (neutral.x === move.x && neutral.y === move.y) board.delete(game.neutralBridge);
    }
    board.set(key, index % 2 === 0 ? PLAYER.RED : PLAYER.IVORY);
  });
  return {
    board,
    currentPlayer: history.length % 2 === 0 ? PLAYER.RED : PLAYER.IVORY,
    history,
    neutralBridge: game.neutralBridge,
    winner: null,
    lastMove: history.at(-1) ?? game.neutralBridge,
  };
}

export function serializeGame(game) {
  return JSON.stringify({
    history: game.history,
    neutralBridge: game.neutralBridge,
  });
}

export function restoreGame(serialized) {
  try {
    const data = JSON.parse(serialized);
    if (!Array.isArray(data.history)) return createGame();
    const initial = data.neutralBridge
      ? placeNeutralBridge(createGame(), data.neutralBridge)
      : createGame();
    return data.history.reduce((game, key) => playMove(game, key), initial);
  } catch {
    return createGame();
  }
}
