import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYER,
  allNeutralMoves,
  createGame,
  evaluateWin,
  forfeitBlockedPlayer,
  legalMoveAt,
  moveKey,
  orientationFor,
  placeNeutralBridge,
  playMove,
  restoreGame,
  serializeGame,
  undoMove,
} from "../src/game.js";

test("red and ivory receive the correct orientation at each shared position", () => {
  assert.equal(orientationFor(PLAYER.RED, 1, 1), "v");
  assert.equal(orientationFor(PLAYER.IVORY, 1, 1), "h");
  assert.equal(orientationFor(PLAYER.RED, 2, 2), "h");
  assert.equal(orientationFor(PLAYER.IVORY, 2, 2), "v");
});

test("one physical position can only hold one tile", () => {
  const board = new Map([[moveKey(1, 1, "v"), PLAYER.RED]]);
  assert.equal(legalMoveAt(board, PLAYER.IVORY, 1, 1), null);
});

test("White places one neutral bridge before regular play", () => {
  const initial = createGame();
  const neutral = moveKey(5, 5, "n");
  assert.ok(allNeutralMoves(initial.board).includes(neutral));

  const game = placeNeutralBridge(initial, neutral);
  assert.equal(game.currentPlayer, PLAYER.RED);
  assert.equal(game.board.get(neutral), PLAYER.NEUTRAL);
  assert.equal(legalMoveAt(game.board, PLAYER.RED, 5, 5), null);
  assert.equal(legalMoveAt(game.board, PLAYER.IVORY, 5, 5), moveKey(5, 5, "h"));

  const restored = restoreGame(serializeGame(game));
  assert.equal(restored.neutralBridge, neutral);
  assert.equal(undoMove(restored).neutralBridge, neutral);

  const afterRedMove = playMove(restored, moveKey(1, 1, "v"));
  assert.equal(afterRedMove.neutralBridge, neutral);
  assert.equal(undoMove(afterRedMove).neutralBridge, neutral);

  const afterActivation = playMove(afterRedMove, moveKey(5, 5, "h"));
  assert.equal(afterActivation.board.has(neutral), false);
  assert.equal(afterActivation.board.get(moveKey(5, 5, "h")), PLAYER.IVORY);
  assert.equal(undoMove(afterActivation).board.get(neutral), PLAYER.NEUTRAL);
});

test("a player with no legal move forfeits the game", () => {
  const board = new Map();
  for (let y = 1; y <= 9; y += 1) {
    for (let x = 1; x <= 9; x += 1) {
      const redMove = orientationFor(PLAYER.RED, x, y);
      if (redMove) board.set(moveKey(x, y, redMove), PLAYER.IVORY);
    }
  }
  const blockedRed = {
    ...createGame(),
    board,
    currentPlayer: PLAYER.RED,
  };
  const result = forfeitBlockedPlayer(blockedRed);

  assert.equal(result.winner?.player, PLAYER.IVORY);
  assert.equal(result.winner?.reason, "blocked");
  assert.deepEqual(result.winner?.path, []);
});

test("red wins by connecting the top and bottom edges", () => {
  const board = new Map();
  let lastMove;
  for (let y = 1; y <= 9; y += 2) {
    lastMove = moveKey(1, y, "v");
    board.set(lastMove, PLAYER.RED);
  }
  const result = evaluateWin(board, PLAYER.RED, lastMove);
  assert.equal(result?.reason, "connection");
  assert.equal(result?.path.length, 5);
});

test("ivory wins by connecting the left and right edges", () => {
  const board = new Map();
  let lastMove;
  for (let x = 1; x <= 9; x += 2) {
    lastMove = moveKey(x, 1, "h");
    board.set(lastMove, PLAYER.IVORY);
  }
  const result = evaluateWin(board, PLAYER.IVORY, lastMove);
  assert.equal(result?.reason, "connection");
  assert.equal(result?.path.length, 5);
});

test("a closed four-sided loop wins", () => {
  const moves = [
    moveKey(2, 2, "h"),
    moveKey(3, 3, "v"),
    moveKey(2, 4, "h"),
    moveKey(1, 3, "v"),
  ];
  const board = new Map(moves.map((move) => [move, PLAYER.RED]));
  const result = evaluateWin(board, PLAYER.RED, moves.at(-1));
  assert.equal(result?.reason, "loop");
  assert.equal(result?.path.length, 4);
});

test("three branches meeting at one peg are not a loop", () => {
  const moves = [
    moveKey(2, 2, "h"),
    moveKey(3, 1, "v"),
    moveKey(3, 3, "v"),
  ];
  const board = new Map(moves.map((move) => [move, PLAYER.RED]));
  assert.equal(evaluateWin(board, PLAYER.RED, moves.at(-1)), null);
});
