(self || module.exports || window)['ChessBoard'] = function(container, config) {
    var CSS = { }, // Css properties
        START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        PAWN    = "p",
        BISHOP  = "b",
        KNIGHT  = "n",
        ROOK    = "r",
        QUEEN   = "q",
        KING    = "k",
        SYMBOLS = "pbnrqkPBNRQK",
        EMPTY   = -1,
        SHIFTS  = { p: 0, b: 1, n: 2, r: 3, q: 4, k: 5 },
        FLAGS   = { NORMAL: 'n', CAPTURE: 'c', EP_CAPTURE: 'e', PROMOTION: 'p', K_CASTLE: 'k', Q_CASTLE: 'q' },
        BITS    = { NORMAL: 0x0, CAPTURE: 0x1, EP_CAPTURE: 0x2, PROMOTION: 0x4, K_CASTLE: 0x8, Q_CASTLE: 0x10 },
        SQUARES = {
            a8:   0, b8:   1, c8:   2, d8:   3, e8:   4, f8:   5, g8:   6, h8:   7,
            a7:  16, b7:  17, c7:  18, d7:  19, e7:  20, f7:  21, g7:  22, h7:  23,
            a6:  32, b6:  33, c6:  34, d6:  35, e6:  36, f6:  37, g6:  38, h6:  39,
            a5:  48, b5:  49, c5:  50, d5:  51, e5:  52, f5:  53, g5:  54, h5:  55,
            a4:  64, b4:  65, c4:  66, d4:  67, e4:  68, f4:  69, g4:  70, h4:  71,
            a3:  80, b3:  81, c3:  82, d3:  83, e3:  84, f3:  85, g3:  86, h3:  87,
            a2:  96, b2:  97, c2:  98, d2:  99, e2: 100, f2: 101, g2: 102, h2: 103,
            a1: 112, b1: 113, c1: 114, d1: 115, e1: 116, f1: 117, g1: 118, h1: 119
        },
        BOARD = new Array(128),
        BLACK = 'b',
        WHITE = 'w',
        TURN = WHITE,
        HISTORY = [],
        HALF_MOVES = 0,
        PLAYERTURN = WHITE,
        CURRENTMOVE = { },
        MOVE_NUMBER = 1;
    
    //! Private functions
    
    // @ignore
    function Throw(error) { throw error; }

    // @desc Validates square strings
    function ValidateSquare(square) { return typeof(square) === "string" && /^[a-h][1-8]$/.test(square); }
    // @desc Validates SAN move notation strings
    function ValidateMoveString(moveString) {
        if (typeof(moveString) !== "string")
            return false;
        
        var tmp = moveString.split('-');
        if (tmp.length == 2)
            return ValidateSquare(tmp[0]) && ValidateSquare(tmp[1]);
        else
            return /^[pbnrkQPBNRKQ]{1}[xabcdefgh12345678]?[abcdefgh]{1}[0-9]{1}(\+|\#){0,1}(\!|\?)?$/.test(moveString);
    }
    
    // @desc Extracts file number from 0x88 notation
    function File(i) { return i & 15; }
    // @desc Extracts rank number from 0x88 notation
    function Rank(i) { return i >> 4; }
    
    // @desc Converts algebraic to SAN.
    function Algebraic(square) { return [ 'abcdefgh'.charAt(File(square)), '87654321'.charAt(Rank(square)) ].join(''); }
    
    function Reset(doReload) {
        BOARD = new Array(128);
        HISTORY = [];
        HALF_MOVES = 0;
        MOVE_NUMBER = 1;
        TURN = WHITE;
        PLAYERTURN = WHITE;
        CURRENTMOVE = { };
        if (doReload || false)
            Load(START_FEN);
    }
    
    // @desc Loads a config
    function Load(config) {
        if (typeof(config) != "object")
            return Throw("Invalid config supplied to Load");

        Reset(false);
        var tokens = config.position.split(/\s+/);
        if (tokens.length == 1)
            return Throw("Invalid FEN string supplied");
        
        var position = tokens[0],
            square = 0,
            valid = SYMBOLS + '12345678/',
            fenValidator = ValidateFEN(config.position);
        
        if (!fenValidator.valid)
            return Throw(fenValidator.error);
        
        for (var i = 0, l = position.length; i < l; ++i) {
            var piece = position.charAt(i);
            if (piece === '/')
                square += 8;
            else if ('0123456789'.indexOf(piece) != -1)
                square += parseInt(piece, 10);
            else {
                if (!PutPiece({ type: piece.toLowerCase(), color: (piece < 'a' ? WHITE : BLACK) }, Algebraic(square)))
                    return Throw("Unable to put piece");
                ++square;
            }
        }
        
        DrawBoard();
    }
    
    function ValidateFEN(position) {
        var tokens = position.split(/\s+/);
        if (tokens.length !== 6)
            return { valid: false, error: 'FEN string must contain six space-delimited fields.' };
        if (isNaN(tokens[5]) || parseInt(tokens[5], 10) <= 0)
            return { valid: false, error: '6th field (move number) must be a positive integer.' };
        if (isNaN(tokens[4]) || (parseInt(tokens[4], 10) < 0))
            return { valid: false, error: '5th field (half move counter) must be a non-negative integer.' };
        if (!/^(-|[abcdefgh][36])$/.test(tokens[3]))
            return { valid: false, error: '4th field (en-passant square) is invalid.' };
        if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(tokens[2]))
            return { valid: false, error: '3rd field (castling availability) is invalid.' };
        if (!/^(w|b)$/.test(tokens[1]))
            return { valid: false, error: '2nd field (side to move) is invalid.' };
        
        var rows = tokens[0].split('/');
        if (rows.length != 8)
            return { valid: false, error: '1st field (position) is invalid. (1)' };
        
        for (var i = 0; i < 8; ++i) {
            var lineFieldCount = 0,
                prevNumber = true;
            for (var j = 0, l = rows[i].length; j < l; ++j) {
                if (!isNaN(rows[i].charAt(j))) {
                    if (!prevNumber)
                        return { valid: false, error: '1st field (position) is invalid. (2)' };
                    lineFieldCount += parseInt(rows[i].charAt(j), 10);
                    prevNumber = true;
                } else {
                    if (!/^[prnbqkPRNBQK]$/.test(rows[i].charAt(j)))
                        return { valid: false, error: '1st field (position) is invalid. (3)' };
                    ++lineFieldCount;
                    prevNumber = false;
                }
            }
            if (lineFieldCount != 8)
                return { valid: false, error: '1st field (position) is invalid. (4)' };
        }
        
        return { valid: true, error: 'No error.' };
    }
    
    // @desc Returns the piece object at given square, or empty if there is none
    function GetPiece(square) {
        return __clone(BOARD[SQUARES[square]]) || { type: EMPTY, color: EMPTY };
    }
    
    function PutPiece(piece, square) {
        if (!('type' in piece && 'color' in piece))
            return false;
        
        if (SYMBOLS.indexOf(piece.type) == -1)
            return false;
        
        if (!(square in SQUARES))
            return false;
            
        piece.coordinates = square;
        BOARD[SQUARES[square]] = piece;
        return true;
    }
    
    function __clone(obj) {
        if (null == obj || "object" != typeof obj) return obj;
        var copy = obj.constructor();
        for (var attr in obj)
            if (obj.hasOwnProperty(attr))
                copy[attr] = obj[attr];
        return copy;
    }
    
    function RemovePiece(square) { BOARD[SQUARES[square]] = null; }
    
    function ExecuteMove(moveString) {
        if (!ValidateMoveString(moveString))
            return false;

        var tokens = moveString.split('-'), src = '', dest = '';
        if (tokens.length == 2) {
            src = tokens[0]; dest = tokens[1];
        } else { // slowest case, avoid at any cost (should work fine on takes)
            tokens = /^([pbnrkQPBNRKQ]){1}([xabcdefgh12345678]?)([abcdefgh]{1}[0-9]{1})(?:\+|\#){0,1}(?:\!|\?)?$/.exec(moveString);
            if (tokens === null)
                return Throw("Could not parse move string '" + moveString + "'");

            // Try to get the piece
            var piece = tokens[1].toLowerCase(),
                opt   = tokens[2];
            dest      = tokens[3];

            if (opt != "x") { // Not a take, optimized loops
                if (isNaN(opt)) {
                    for (var i = 1, p = GetPiece(opt + i); i <= 8 && src.length != 2; ++i, p = GetPiece(opt + i))
                        if (p.type == piece && p.color == TURN)
                            src = opt + i;
                } else {
                    for (var i = 0, p = GetPiece('abcdefgh'.charAt(i) + opt); i < 8 && src.length != 2; ++i, p = GetPiece('abcdefgh'.charAt(i) + opt))
                        if (p.type == piece && p.color == TURN)
                            src = 'abcdefgh'.charAt(i) + src;
                }
            }
            
            if (src.length != 2) { // Origin still not found
                // Just iterate over the board originating on target cell (rook takes on lines, bishop diagonals, etc)
                // Much bad
            }
            
            if (src.length != 2 || dest.length != 2)
                return Throw("Could not parse move string '" + moveString + "'");
        }
        
        var moveFlags = 0, captured = GetPiece(dest);

        HISTORY.push({ from: src, to: dest, color: TURN, captured: captured, flags: moveFlags });
        TURN = TURN == WHITE ? BLACK : WHITE;
        PutPiece(GetPiece(src), dest);
        RemovePiece(src);
        // AnimateMove(src, dest); // Display onboard
    }
    
    function UndoMove() {
        var moveData = HISTORY.pop();
        if (moveData == null)
            return null;
        
        var from = moveData.from, to = moveData.to, oldPiece = captured, flags = moveData.flags, original = GetPiece(to);
        PutPiece(captured, to);
        PutPiece(original, from);
        // AnimateUndo(from, to, captured, original); // Display
    }
    
    function DrawBoard()
    {
        var containerNode = document.getElementById(container);
        if (container === null)
            return Throw("Could not find the container node to draw the board.");

        containerNode.appendChild(document.createElement("div"));
        containerNode = document.querySelector("#" + container + " > div");
        if (containerNode == null)
            return Throw("DOM Node could not be found.");
            
        containerNode.id = "chessboard-container";
        
        // TODO: Only bind once
        $("body").click(function(e) { HandleCellClick(e); });

        for (var i = 8; i > 0; --i) {
            var row = document.createElement("div");
            for (var j = 0; j < 8; ++j) {
                var cell = document.createElement("div"),
                    piece = GetPiece("abcdefgh".charAt(j) + i);
                cell.className = "chessboard-cell " + ((i + j) % 2 ? "odd" : "even");
                cell.setAttribute("data-cellName", "abcdefgh".charAt(j) + i);
                if (piece.type != EMPTY) {
                    var imgNode = document.createElement("img");
                    // Fixit
                    imgNode.src = "http://chessboardjs.com/img/chesspieces/wikipedia/" + piece.color + piece.type.toUpperCase() + ".png";
                    cell.appendChild(imgNode);
                }
                row.appendChild(cell);
            }
            containerNode.appendChild(row);
        }
    }
    
    // @desc Handles click events used to move pieces.
    function HandleCellClick(e) {
        var cell = null;
        if (e.target !== undefined) {
            cell = e.target;
            if (cell.nodeName == "IMG")
                cell = cell.parentNode;
        }
        
        if (cell === null)
            return Throw("Unexpected behavior on click handler.");
    
        var piece = GetPiece($(cell).attr("data-cellName"));
        if ('ORIGIN' in CURRENTMOVE) {     // Picked destination cell
            if (piece.color == PLAYERTURN) // Do not select our own figures as targets
                return;
                
            if (!('coordinates' in piece)) // Targeting an empty square
                piece.coordinates = $(cell).attr("data-cellName");

            CURRENTMOVE.DESTINATION = piece;
            $(cell).toggleClass("highlight");
            if (ValidateCurrentMove())
                ExecuteCurrentMove();
        } else {                           // Picked origin cell
            if (piece.color != PLAYERTURN) // Do not select the opponent's figures as sources
                return;
            CURRENTMOVE.ORIGIN = piece;
            $(cell).toggleClass("highlight");
        }
        console.log(CURRENTMOVE);
    }
    
    // @desc Checks if the player's move is a valid move on the current board.
    function ValidateCurrentMove() {
        return true;
    }
    
    // @desc Executes the player's move on the board and updates all related states.
    function ExecuteCurrentMove() {
        
        // Aaaand we're done
        CURRENTMOVE = { };
    }
    
    function ASCII() {
        var s = '   +------------------------+\n';
        for (var i = SQUARES.a8; i <= SQUARES.h1; i++) {
            /* display the rank */
            if (File(i) === 0)
                s += ' ' + '87654321'.charAt(Rank(i)) + ' |';

            /* empty piece */
            if (BOARD[i] == null)
                s += ' . ';
            else {
                var piece = BOARD[i].type,
                    color = BOARD[i].color;
                s += ' ' + ((color === WHITE) ? piece.toUpperCase() : piece.toLowerCase()) + ' ';
            }

            if ((i + 1) & 0x88) {
                s += '|\n';
                i += 8;
            }
        }
        s += '   +------------------------+\n';
        s += '     a  b  c  d  e  f  g  h\n';

        return s;
    }

    //! End of private functions
    
    if (typeof(config) === "undefined" || config === null)
        config = { position: START_FEN };
    else if (typeof(config) === "string")
        config = { position: config };
    else if (!('position' in config))
        config.position = START_FEN;
    Load(config);
    
    // Exposed public stuff
    return {
        WHITE: WHITE,
        BLACK: BLACK,
        PAWN: PAWN,
        KNIGHT: KNIGHT,
        BISHOP: BISHOP,
        QUEEN: QUEEN,
        ROOK: ROOK,
        KING: KING,
        SQUARES: SQUARES,
        
        Load: function(config) { return Load(config); },
        Reset: function() { return Reset(); },
        GetPiece: function(sq) { return GetPiece(sq); },
        DoMove: function(moveStr) { return ExecuteMove(moveStr, true); },
        GetHistory: function() { return HISTORY.slice(0).reverse(); }, // Hacking through a copy
        UndoMove: function() { return UndoMove(); },
        ASCII: function() { return ASCII(); },
        // etc
    };
}
