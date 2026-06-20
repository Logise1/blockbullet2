// Core Block Blast Game Logic

// Defined standard and complex shapes.
// grid: 2D array representation. 1 = block, 0 = empty.
export const SHAPES = [
  // 1x1 Single
  { id: '1x1', grid: [[1]], color: '#00f0ff' }, // Cyan glow
  
  // 1x2 Dominoes
  { id: '1x2_v', grid: [[1], [1]], color: '#00f0ff' },
  { id: '1x2_h', grid: [[1, 1]], color: '#00f0ff' },
  
  // 1x3 Straight
  { id: '1x3_v', grid: [[1], [1], [1]], color: '#38bdf8' },
  { id: '1x3_h', grid: [[1, 1, 1]], color: '#38bdf8' },
  
  // 1x4 Straight
  { id: '1x4_v', grid: [[1], [1], [1], [1]], color: '#2563eb' },
  { id: '1x4_h', grid: [[1, 1, 1, 1]], color: '#2563eb' },
  
  // 1x5 Straight (tricky!)
  { id: '1x5_v', grid: [[1], [1], [1], [1], [1]], color: '#1d4ed8' },
  { id: '1x5_h', grid: [[1, 1, 1, 1, 1]], color: '#1d4ed8' },
  
  // 2x2 Square
  { id: '2x2', grid: [[1, 1], [1, 1]], color: '#eab308' }, // Yellow
  
  // 3x3 Square (very tricky!)
  { id: '3x3', grid: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], color: '#ca8a04' }, // Gold
  
  // L-shapes (2x2)
  { id: 'L2_0', grid: [[1, 0], [1, 1]], color: '#ec4899' }, // Neon Pink
  { id: 'L2_1', grid: [[1, 1], [1, 0]], color: '#ec4899' },
  { id: 'L2_2', grid: [[1, 1], [0, 1]], color: '#ec4899' },
  { id: 'L2_3', grid: [[0, 1], [1, 1]], color: '#ec4899' },

  // L-shapes (3x3)
  { id: 'L3_0', grid: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], color: '#f43f5e' }, // Rose Red
  { id: 'L3_1', grid: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], color: '#f43f5e' },
  { id: 'L3_2', grid: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], color: '#f43f5e' },
  { id: 'L3_3', grid: [[0, 0, 1], [0, 0, 1], [1, 1, 1]], color: '#f43f5e' },

  // T-shapes (3x3)
  { id: 'T3_0', grid: [[1, 1, 1], [0, 1, 0], [0, 1, 0]], color: '#a855f7' }, // Purple
  { id: 'T3_1', grid: [[0, 0, 1], [1, 1, 1], [0, 0, 1]], color: '#a855f7' },
  { id: 'T3_2', grid: [[0, 1, 0], [0, 1, 0], [1, 1, 1]], color: '#a855f7' },
  { id: 'T3_3', grid: [[1, 0, 0], [1, 1, 1], [1, 0, 0]], color: '#a855f7' },

  // Corner/V-shape 3x3
  { id: 'C3_0', grid: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], color: '#f97316' }, // Orange

  // Z and S shapes (2x3 or 3x2)
  { id: 'Z_h', grid: [[1, 1, 0], [0, 1, 1]], color: '#22c55e' }, // Neon Green
  { id: 'Z_v', grid: [[0, 1], [1, 1], [1, 0]], color: '#22c55e' },
  { id: 'S_h', grid: [[0, 1, 1], [1, 1, 0]], color: '#10b981' }, // Emerald
  { id: 'S_v', grid: [[1, 0], [1, 1], [0, 1]], color: '#10b981' }
];

// Initialize an empty 8x8 board
export function createBoard() {
  const board = [];
  for (let r = 0; r < 8; r++) {
    board.push(new Array(8).fill(null));
  }
  return board;
}

// Check if a piece can be placed at board[startRow][startCol]
export function canPlacePiece(board, pieceGrid, startRow, startCol) {
  const pRows = pieceGrid.length;
  const pCols = pieceGrid[0].length;

  for (let r = 0; r < pRows; r++) {
    for (let c = 0; c < pCols; c++) {
      if (pieceGrid[r][c] === 1) {
        const boardRow = startRow + r;
        const boardCol = startCol + c;

        // Check board bounds
        if (boardRow < 0 || boardRow >= 8 || boardCol < 0 || boardCol >= 8) {
          return false;
        }

        // Check if cell is already occupied
        if (board[boardRow][boardCol] !== null) {
          return false;
        }
      }
    }
  }
  return true;
}

// Places a piece on the board, modifying the board array in-place.
// Returns the number of cells occupied (for placement points).
export function placePiece(board, piece, startRow, startCol) {
  const pRows = piece.grid.length;
  const pCols = piece.grid[0].length;
  let cellsCount = 0;

  for (let r = 0; r < pRows; r++) {
    for (let c = 0; c < pCols; c++) {
      if (piece.grid[r][c] === 1) {
        board[startRow + r][startCol + c] = piece.color;
        cellsCount++;
      }
    }
  }
  return cellsCount;
}

// Scans the board for completely filled rows and columns.
// Clears them in-place.
// Returns an object containing lists of cleared row/col indices.
export function checkLineClears(board) {
  const rowsToClear = [];
  const colsToClear = [];

  // Check rows
  for (let r = 0; r < 8; r++) {
    let rowFilled = true;
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === null) {
        rowFilled = false;
        break;
      }
    }
    if (rowFilled) rowsToClear.push(r);
  }

  // Check columns
  for (let c = 0; c < 8; c++) {
    let colFilled = true;
    for (let r = 0; r < 8; r++) {
      if (board[r][c] === null) {
        colFilled = false;
        break;
      }
    }
    if (colFilled) colsToClear.push(c);
  }

  // Perform clear in-place (nullify all elements in cleared rows & columns)
  rowsToClear.forEach(r => {
    for (let c = 0; c < 8; c++) {
      board[r][c] = null;
    }
  });

  colsToClear.forEach(c => {
    for (let r = 0; r < 8; r++) {
      board[r][c] = null;
    }
  });

  return {
    rows: rowsToClear,
    cols: colsToClear,
    count: rowsToClear.length + colsToClear.length
  };
}

// Checks if the user has any valid move remaining on the board with any of their pieces
export function hasAnyLegalMoves(board, pieces) {
  // If no pieces are left in the pool, return true (about to get new pieces or awaiting sync)
  const activePieces = pieces.filter(p => p !== null);
  if (activePieces.length === 0) return true;

  for (const piece of activePieces) {
    const pRows = piece.grid.length;
    const pCols = piece.grid[0].length;

    // Scan all possible positions on the 8x8 board
    for (let r = 0; r <= 8 - pRows; r++) {
      for (let c = 0; c <= 8 - pCols; c++) {
        if (canPlacePiece(board, piece.grid, r, c)) {
          return true; // Found at least one valid spot for one piece
        }
      }
    }
  }

  return false; // No pieces can fit anywhere
}

// Selects three random shapes from SHAPES
export function getRandomPieces() {
  const selection = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * SHAPES.length);
    // Deep clone the shape object to avoid shared references
    selection.push(JSON.parse(JSON.stringify(SHAPES[idx])));
  }
  return selection;
}

// Calculates placement and clearance scores
export function calculateScore(placedCellsCount, linesClearedCount, currentStreak) {
  let scoreGained = placedCellsCount; // 1 pt per placed cell
  let nextStreak = currentStreak;

  if (linesClearedCount > 0) {
    nextStreak++;
    
    // Combo multiplier for clearing multiple lines at once
    let clearPoints = 0;
    switch (linesClearedCount) {
      case 1: clearPoints = 10; break;
      case 2: clearPoints = 30; break;
      case 3: clearPoints = 60; break;
      case 4: clearPoints = 100; break;
      case 5: clearPoints = 150; break;
      default: clearPoints = 200; break;
    }
    
    // Streak bonus points
    const streakBonus = (nextStreak - 1) * 10;
    
    scoreGained += clearPoints + streakBonus;
  } else {
    nextStreak = 0; // Streak broken
  }

  return {
    scoreGained,
    nextStreak
  };
}
