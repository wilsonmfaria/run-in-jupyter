// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import Parser = require("tree-sitter");
const PythonLang: any = require("tree-sitter-python");

let parser: Parser;
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "run-in-jupyter" is now active!'
  );

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable0 = vscode.commands.registerCommand(
    "run-in-jupyter.runAndMoveDown",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.selection;
      if (!selection.isEmpty) {
        // Run selected code only
        const code = editor.document.getText(selection);
        if (code.trim().length) {
          sendToJupyter(code);
          // Optionally, move cursor to next code line after selection
          moveToNextCodeLine(editor.document, selection.end.line + 1);
        }
      } else {
        // Run inferred block
        const block = await getPythonBlockAtCursorWithLines();
        if (!block) return;
        const { code, endLine } = block;
        sendToJupyter(code);
        moveToNextCodeLine(editor.document, endLine + 1);
      }
    }
  );

  let disposable1 = vscode.commands.registerCommand(
    "run-in-jupyter.runAndMoveDown",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const selection = editor.selection;
      if (!selection.isEmpty) {
        // Run selected code only
        const code = editor.document.getText(selection);
        if (code.trim().length) {
          sendToJupyter(code);
          // Optionally, move cursor to next code line after selection
          moveToNextCodeLine(editor.document, selection.end.line + 1);
        }
      } else {
        // Run inferred block
        const code  = await getPythonBlockAtCursor();
        if (!code) return;
        sendToJupyter(code);
      }
    }
  );
  context.subscriptions.push(disposable0,disposable1);
}

// This method is called when your extension is deactivated
export function deactivate() {}

// Get the python parser
function getParser(): Parser {
  if (!parser) {
    parser = new Parser();
    // This will work with both CJS and ESM output
    const lang = PythonLang.default ?? PythonLang;
    parser.setLanguage(lang);
  }
  return parser;
}

// Helper: Given a node, expand to include chained else/elif/except/finally/elif/else/clauses, if present
function expandCompoundBlock(node: Parser.SyntaxNode): Parser.SyntaxNode {
  // Handle if/elif/else
  if (["if_statement", "elif_clause", "else_clause"].includes(node.type)) {
    let top = node;
    // Climb up if we're inside elif/else of an if_statement
    while (top.parent && ["if_statement", "elif_clause", "else_clause"].includes(top.parent.type)) {
      top = top.parent;
    }
    // From the top if_statement, expand downward to include chained elif/else
    let last = top;
    if (top.type === "if_statement" && top.namedChildCount) {
      // The structure: if_statement -> condition, body, elif_clause*, else_clause?
      // We want from top.startPosition to last clause's endPosition
      const clauses = [];
      for (let i = 0; i < top.namedChildCount; i++) {
        const child = top.namedChild(i);
        if (child !== null){
          if (["elif_clause", "else_clause"].includes(child.type)) {
            last = child;
          }
        }
      }
    }
    // Return node from start of top to end of last
    // If top === last, just return top
    if (top !== last) {
      // Tree-sitter doesn't provide direct slice, so return a "virtual" node with expanded range
      // We'll extract text using its start/end positions
      return {
        ...top,
        startPosition: top.startPosition,
        endPosition: last.endPosition,
      } as Parser.SyntaxNode;
    }
    return top;
  }

  // Handle try/except/else/finally
  if (node.type === "try_statement") {
    // try_statement node already includes all its clauses
    return node;
  }
  if (["except_clause", "finally_clause"].includes(node.type) && node.parent && node.parent.type === "try_statement") {
    return node.parent;
  }
  // Handle with_statement (no chaining but same logic)
  if (node.type === "with_statement") {
    return node;
  }

  // For-loop/while-loop: usually, these are not chained, so just return the node itself
  if (["for_statement", "while_statement"].includes(node.type)) {
    return node;
  }

  return node;
}

// Find the most specific "interesting" node at the cursor, then expand compound blocks if needed
export async function getPythonBlockAtCursor(): Promise<string | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const document = editor.document;
  const cursor = editor.selection.active;

  const code = document.getText();
  const parser = getParser();
  const tree = parser.parse(code);

  // Find the smallest node at cursor
  function getNodeAtPosition(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (node.startPosition.row > cursor.line || node.endPosition.row < cursor.line) return null;
    for (const child of node.namedChildren) {
      const found = getNodeAtPosition(child);
      if (found) return found;
    }
    return node;
  }
  let node = getNodeAtPosition(tree.rootNode);

  // Walk up to the most useful statement block
  // List of block types to select for full block execution
  const blockTypes = [
    "function_definition",
    "class_definition",
    "for_statement",
    "while_statement",
    "if_statement",
    "elif_clause",
    "else_clause",
    "try_statement",
    "except_clause",
    "finally_clause",
    "with_statement",
    "expression_statement",
    "assignment",
    "augmented_assignment",
    "dictionary",
    "list",
    "set",
    "tuple",
    "decorated_definition",
    "block",
    "string",
    "call",
    "import_statement",
    "import_from_statement",
    "return_statement",
    "raise_statement",
    "assert_statement",
    "yield",
    "yield_from",
    "await",
    "comment",
    "global_statement",
    "nonlocal_statement",
    "pass_statement",
    "break_statement",
    "continue_statement",
  ];

  // Walk up to nearest interesting block type (and not "module", which is the file)
  while (node && (!blockTypes.includes(node.type) || node.type === "module")) {
    node = node.parent;
  }
  if (!node) return null;

  // If block is compound (if/elif/else, try/except/finally, etc.), expand to include all chained parts
  node = expandCompoundBlock(node);

  // Extract text from node range
  const start = new vscode.Position(node.startPosition.row, node.startPosition.column);
  const end = new vscode.Position(node.endPosition.row, node.endPosition.column);
  const range = new vscode.Range(start, end);
  let text = document.getText(range);

  return text.trimEnd();
}

export async function getPythonBlockAtCursorWithLines(): Promise<{ code: string, startLine: number, endLine: number } | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const document = editor.document;
  const cursor = editor.selection.active;

  const code = document.getText();
  const parser = getParser();
  const tree = parser.parse(code);

  function getNodeAtPosition(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (node.startPosition.row > cursor.line || node.endPosition.row < cursor.line) return null;
    for (const child of node.namedChildren) {
      const found = getNodeAtPosition(child);
      if (found) return found;
    }
    return node;
  }
  let node = getNodeAtPosition(tree.rootNode);

  // This is the trick:
  // If we are inside a string node, but it's part of an assignment/expression, return the assignment/expression node
  if (node && node.type === "string" && node.parent) {
    // assignment or expression_statement or argument
    let candidate: Parser.SyntaxNode | null = node.parent;
    while (candidate && ["parenthesized_expression", "argument_list"].includes(candidate.type)) {
      candidate = candidate.parent;
    }
    if (candidate && ["assignment", "expression_statement"].includes(candidate.type)) {
      node = candidate;
    }
  }

  // Usual block types (including all the compound/loop/function/class blocks)
  const blockTypes = [
    "function_definition", "class_definition", "for_statement", "while_statement",
    "if_statement", "elif_clause", "else_clause", "try_statement", "except_clause", "finally_clause",
    "with_statement", "expression_statement", "assignment", "augmented_assignment",
    "dictionary", "list", "set", "tuple", "decorated_definition", "block", "call",
    "import_statement", "import_from_statement", "return_statement", "raise_statement",
    "assert_statement", "yield", "yield_from", "await", "comment",
    "global_statement", "nonlocal_statement", "pass_statement", "break_statement", "continue_statement",
  ];

  while (node && (!blockTypes.includes(node.type) || node.type === "module")) {
    node = node.parent;
  }
  if (!node) return null;

  node = expandCompoundBlock(node);

  const start = new vscode.Position(node.startPosition.row, node.startPosition.column);
  const end = new vscode.Position(node.endPosition.row, node.endPosition.column);
  const range = new vscode.Range(start, end);
  let text = document.getText(range);

  return { code: text.trimEnd(), startLine: node.startPosition.row, endLine: node.endPosition.row };
}

// Move cursor to line after the block
function moveToNextCodeLine(document: vscode.TextDocument, fromLine: number) {
  const nextLine = findNextNonEmptyCodeLine(document, fromLine);
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const pos = new vscode.Position(nextLine, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));
}

function findNextNonEmptyCodeLine(document: vscode.TextDocument, fromLine: number): number {
  let line = fromLine;
  while (line < document.lineCount) {
    const text = document.lineAt(line).text;
    // Skip blank or pure-comment lines
    if (text.trim() && !/^\s*#/.test(text)) {
      return line;
    }
    line++;
  }
  // If not found, return the last line
  return document.lineCount - 1;
}

function sendToJupyter(code: string) {
  vscode.commands.executeCommand("jupyter.execSelectionInteractive", code);
}
