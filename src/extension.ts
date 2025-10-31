import * as vscode from "vscode";
import Parser = require("tree-sitter");
import type { Language } from "tree-sitter"; // Assuming proper types are installed

let parser: Parser;

// Define a minimal type for the tree-sitter-python module
interface PythonLanguage {
  default?: Language; // Handle both CJS and ESM exports
}

// Load the module
const PythonLang: PythonLanguage = require("tree-sitter-python");

interface PythonBlock {
  code: string;
  startLine?: number;
  endLine?: number;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "python-codesitter" is now active!');

  const disposable = vscode.commands.registerCommand("python-codesitter.runAndMoveDown", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "python") {
      vscode.window.showErrorMessage("No active Python editor found.");
      return;
    }

    const selection = editor.selection;
    if (!selection.isEmpty) {
      const rawCode = editor.document.getText(selection);
      const code = dedent(rawCode);  // Replace .trim()
      if (code) {
        await sendToJupyter(code);
        moveToNextCodeLine(editor.document, selection.end.line + 1);
      }
      return;
    }

    const block = await getPythonBlockAtCursor(true);
    if (!block) {
      vscode.window.showErrorMessage("No executable Python block found at cursor.");
      return;
    }

    await sendToJupyter(block.code);
    if (block.endLine !== undefined) {
      moveToNextCodeLine(editor.document, block.endLine + 1);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  if (parser) {
    parser.reset();
  }
}

function dedent(code: string): string {
  const lines = code.split('\n');
  if (lines.length === 0) return code;

  let minIndent = Infinity;

  // Find min indent ONLY from lines that have content
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue; // Skip empty/whitespace-only lines
    const indent = line.match(/^\s*/)![0].length;
    minIndent = Math.min(minIndent, indent);
  }

  // If all lines were empty or no indent was found, just trim
  if (minIndent === Infinity || minIndent === 0) {
    return code.trimEnd();
  }

  // --- THIS IS THE FIX ---
  // Always slice every line.
  // If a line is "    " and minIndent is 4, .slice(4) correctly returns "".
  const dedentedLines = lines.map(line => line.slice(minIndent));

  return dedentedLines.join('\n').trimEnd();
}

function getParser(): Parser {
  if (!parser) {
    parser = new Parser();
    try {
      const lang = PythonLang.default ?? PythonLang;
      parser.setLanguage(lang as Language);
    } catch (error) {
      vscode.window.showErrorMessage("Failed to load tree-sitter-python: " + error);
      throw error;
    }
  }
  return parser;
}

//function expandCompoundBlock(node: Parser.SyntaxNode): Parser.SyntaxNode {
//  if (["if_statement", "elif_clause", "else_clause"].includes(node.type)) {
//    let top = node;
//    while (top.parent && ["if_statement", "elif_clause", "else_clause"].includes(top.parent.type)) {
//      top = top.parent;
//    }
//    if (top.type !== "if_statement") return top;
//
//    let last = top;
//    for (const child of top.namedChildren) {
//      if (["elif_clause", "else_clause"].includes(child.type)) {
//        last = child;
//      }
//    }
//    if (top === last) return top;
//
//    return {
//      ...top,
//      endPosition: last.endPosition,
//      endIndex: last.endIndex,
//    } as Parser.SyntaxNode;
//  }
//  if (node.type === "try_statement" || ["except_clause", "finally_clause"].includes(node.type) && node.parent?.type === "try_statement") {
//    return node.type === "try_statement" ? node : node.parent!;
//  }
//  if (["with_statement", "for_statement", "while_statement"].includes(node.type)) {
//    return node;
//  }
//  return node;
//}

async function getPythonBlockAtCursor(returnLines: boolean = false): Promise<PythonBlock | null> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "python") return null;
  const document = editor.document;
  const cursor = editor.selection.active;
  const code = document.getText();
  const parser = getParser();
  const tree = parser.parse(code);
  const tsCursor = { row: cursor.line, column: cursor.character };
  let node = tree.rootNode.namedDescendantForPosition(tsCursor);


  if (node.type === "string" && node.parent) {
    let candidate: Parser.SyntaxNode | null = node.parent;
    while (candidate && ["parenthesized_expression", "argument_list"].includes(candidate.type)) {
      candidate = candidate.parent;
    }
    if (candidate && ["assignment", "expression_statement"].includes(candidate.type)) {
      node = candidate;
    }
  }

  const blockTypes = [
    "function_definition", "class_definition", "for_statement", "while_statement",
    "if_statement", "try_statement", "with_statement", "expression_statement",
    "assignment", "augmented_assignment", "import_statement", "import_from_statement",
    "return_statement", "raise_statement", "assert_statement", "global_statement",
    "nonlocal_statement", "pass_statement", "break_statement", "continue_statement",
  ];

  let blockNode: Parser.SyntaxNode | null = node;
  while (blockNode && (!blockTypes.includes(blockNode.type) || blockNode.type === "module")) {
    blockNode = blockNode.parent;
  }
  if (!blockNode) return null;

  // Get the start and end line numbers from the node
  const startLineNum = blockNode.startPosition.row;
  const endLineNum = blockNode.endPosition.row;

  // Get the full text for all lines in the block, from column 0
  let text = "";
  for (let i = startLineNum; i <= endLineNum; i++) {
      // Get the full line text
      text += document.lineAt(i).text;
      
      // Add newline back, except for the very last line
      if (i < endLineNum) {
          text += "\n";
      }
  }

  // Now, dedent will correctly find minIndent = 8 and work perfectly
  const dedentedText = dedent(text); 

  return {
    code: dedentedText,
    ...(returnLines ? { startLine: startLineNum, endLine: endLineNum } : {}),
  };
}

function moveToNextCodeLine(document: vscode.TextDocument, fromLine: number) {
  const nextLine = findNextNonEmptyCodeLine(document, fromLine);
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const lineText = document.lineAt(nextLine).text;
  const indentMatch = lineText.match(/^\s*/);
  const indentColumn = indentMatch ? indentMatch[0].length : 0;

  const pos = new vscode.Position(nextLine, indentColumn);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos));
}

function findNextNonEmptyCodeLine(document: vscode.TextDocument, fromLine: number): number {
  let line = fromLine;
  while (line < document.lineCount) {
    const text = document.lineAt(line).text;
    if (text.trim() && !/^\s*#/.test(text)) {
      return line;
    }
    line++;
  }
  return document.lineCount - 1;
}

async function sendToJupyter(code: string) {
  const jupyterExtension = vscode.extensions.getExtension("ms-toolsai.jupyter");
  if (!jupyterExtension) {
    vscode.window.showErrorMessage("Jupyter extension is not installed. Please install it to use this feature.");
    return;
  }
  try {
    await vscode.commands.executeCommand("jupyter.execSelectionInteractive", code);
  } catch (error) {
    vscode.window.showErrorMessage("Failed to execute code in Jupyter: " + error);
  }
}