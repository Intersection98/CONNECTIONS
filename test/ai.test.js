import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseComputerMove,
  chooseNeutralBridge,
  choosePerfectRedMove,
  choosePerfectRedGoldMove,
  chooseRedGoldCounterOpening,
  chooseWhiteGoldHookReply,
  allowsOpponentFork,
} from "../src/ai.js";
import {
  PLAYER,
  allLegalMoves,
  allNeutralMoves,
  createGame,
  moveKey,
  placeNeutralBridge,
  playMove,
} from "../src/game.js";

function gameWith(board, currentPlayer) {
  return {
    ...createGame(),
    board,
    currentPlayer,
  };
}

test("computer takes an immediate winning move", () => {
  const board = new Map();
  for (const y of [1, 3, 5, 7]) {
    board.set(moveKey(1, y, "v"), PLAYER.RED);
  }
  const game = gameWith(board, PLAYER.RED);
  assert.equal(chooseComputerMove(game), moveKey(1, 9, "v"));
});

test("computer blocks the opponent's only immediate win", () => {
  const board = new Map();
  for (const y of [1, 3, 5, 7]) {
    board.set(moveKey(1, y, "v"), PLAYER.RED);
  }
  const game = gameWith(board, PLAYER.IVORY);
  assert.equal(chooseComputerMove(game), moveKey(1, 9, "h"));
});

test("computer always chooses a legal opening move", () => {
  const game = createGame();
  const move = chooseComputerMove(game, 2);
  assert.ok(allLegalMoves(game.board, game.currentPlayer).includes(move));
});

test("computer chooses a legal neutral bridge position", () => {
  const game = createGame();
  const move = chooseNeutralBridge(game);
  assert.ok(allNeutralMoves(game.board).includes(move));
  assert.equal(move, moveKey(5, 5, "n"));
});

test("Red opens by blocking the inward side of White's gold bridge", () => {
  const cases = new Map([
    [moveKey(1, 1, "n"), moveKey(3, 1, "v")],
    [moveKey(9, 1, "n"), moveKey(7, 1, "v")],
    [moveKey(1, 9, "n"), moveKey(3, 9, "v")],
    [moveKey(9, 9, "n"), moveKey(7, 9, "v")],
  ]);
  for (const [gold, expected] of cases) {
    const game = placeNeutralBridge(createGame(), gold);
    assert.equal(chooseRedGoldCounterOpening(game), expected);
    assert.equal(chooseComputerMove(game), expected);
  }
});

test("White answers the Red block by hooking into the gold bridge", () => {
  const cases = new Map([
    [moveKey(1, 1, "n"), moveKey(2, 2, "v")],
    [moveKey(9, 1, "n"), moveKey(8, 2, "v")],
    [moveKey(1, 9, "n"), moveKey(2, 8, "v")],
    [moveKey(9, 9, "n"), moveKey(8, 8, "v")],
  ]);
  for (const [gold, expected] of cases) {
    let game = placeNeutralBridge(createGame(), gold);
    game = playMove(game, chooseRedGoldCounterOpening(game));
    assert.equal(chooseWhiteGoldHookReply(game), expected);
    assert.equal(chooseComputerMove(game), expected);
  }
});

test("White extends through the open side of a central gold bridge", () => {
  const gold = moveKey(5, 5, "n");
  let game = placeNeutralBridge(createGame(), gold);
  const redOpening = chooseRedGoldCounterOpening(game);
  game = playMove(game, redOpening);
  const whiteReply = chooseWhiteGoldHookReply(game);
  assert.equal(redOpening, moveKey(3, 5, "v"));
  assert.equal(whiteReply, moveKey(7, 5, "h"));
  assert.equal(chooseComputerMove(game), whiteReply);
});

test("Red repairs the paired tree after the central gold bridge", () => {
  let game = placeNeutralBridge(createGame(), moveKey(5, 5, "n"));
  assert.equal(choosePerfectRedGoldMove(game), moveKey(7, 5, "v"));
  assert.equal(chooseComputerMove(game), moveKey(7, 5, "v"));

  game = playMove(game, moveKey(7, 5, "v"));
  game = playMove(game, moveKey(3, 5, "h"));
  const repair = choosePerfectRedGoldMove(game);
  assert.equal(repair, moveKey(1, 5, "v"));
  assert.ok(allLegalMoves(game.board, PLAYER.RED).includes(repair));
});

test("White activates its reserved bridge when it completes a connection", () => {
  const neutralBridge = moveKey(1, 1, "n");
  const board = new Map([
    [neutralBridge, PLAYER.NEUTRAL],
    [moveKey(3, 1, "h"), PLAYER.IVORY],
    [moveKey(5, 1, "h"), PLAYER.IVORY],
    [moveKey(7, 1, "h"), PLAYER.IVORY],
    [moveKey(9, 1, "h"), PLAYER.IVORY],
  ]);
  const game = {
    ...gameWith(board, PLAYER.IVORY),
    neutralBridge,
    history: ["3,3,v"],
  };
  assert.equal(chooseComputerMove(game), moveKey(1, 1, "h"));
});

test("computer avoids a move that concedes an opponent double threat", () => {
  const history = [
    "2,6,h", "7,5,h", "1,1,v", "2,4,v", "3,5,v", "7,7,h",
    "7,3,v", "1,3,h", "5,9,v", "4,2,v", "1,7,v", "6,6,v",
    "2,2,h", "6,2,v", "3,1,v", "5,7,h", "1,9,v", "9,1,h",
    "5,3,v", "6,4,v", "7,9,v",
  ];
  const game = history.reduce(
    (state, move) => playMove(state, move),
    placeNeutralBridge(createGame(), moveKey(5, 5, "n")),
  );
  const move = chooseComputerMove(game);

  assert.equal(game.currentPlayer, PLAYER.IVORY);
  assert.equal(allowsOpponentFork(game, move), false);
  assert.ok([moveKey(3, 3, "h"), moveKey(8, 6, "v")].includes(move));
  assert.equal(allowsOpponentFork(game, moveKey(5, 1, "h")), true);
});

test("perfect Red strategy survives arbitrary opponent replies", () => {
  let seed = 20260903;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  for (let trial = 0; trial < 200; trial += 1) {
    let game = createGame();
    while (!game.winner) {
      const moves = allLegalMoves(game.board, game.currentPlayer);
      const move = game.currentPlayer === PLAYER.RED
        ? choosePerfectRedMove(game)
        : moves[Math.floor(random() * moves.length)];
      assert.ok(move, `strategy ran out of moves in trial ${trial}`);
      game = playMove(game, move);
    }
    assert.equal(game.winner.player, PLAYER.RED, `Red lost trial ${trial}`);
  }
});
