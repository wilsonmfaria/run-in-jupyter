// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

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
  let disposable1 = vscode.commands.registerCommand(
    "run-in-jupyter.runAndMoveDown",
    () => {
      const currentBlockCode = getCurrentBlock();
      if (currentBlockCode === "") {
        return;
      }
      sendToJupyter(currentBlockCode);
    }
  );
  
  let disposable2 = vscode.commands.registerCommand(
    "run-in-jupyter.justRun",
    () => {
      const currentBlockCode = getCurrentBlock(false);
      if (currentBlockCode === "") {
        return;
      }
      sendToJupyter(currentBlockCode);
    }
  );

  context.subscriptions.push(disposable1, disposable2);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function moveToLineStart(lineNumber: number) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const position = new vscode.Position(lineNumber, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position));
}

function insertEmptyLineAtEnd() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const lastLine = document.lineAt(document.lineCount - 1);
  const endOfDocument = lastLine.range.end;

  editor.edit((editBuilder) => {
    editBuilder.insert(endOfDocument, "\n");
  });
}

function getCurrentBlock(moveDown: boolean = true): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return "";

  const document = editor.document;
  const selection = editor.selection;

  // If there's an active selection, just return that
  if (!selection.isEmpty) return document.getText(selection);

  const cursorPosition = selection.active;
  if (cursorPosition.line >= document.lineCount || cursorPosition.line < 0) return "";

  const currentLine = document.lineAt(cursorPosition.line);
  const lineText = currentLine.text;

  // --------- 1. Multiline string check ---------
  const multilineStringInfo = isInsideMultilineString(document, cursorPosition);
  if (multilineStringInfo) {
    return handleMultilineString(document, multilineStringInfo, moveDown);
  }

  // --------- 2. Multi-line dict/list/tuple/set (bracket blocks) ---------
  // This block finds the full bracketed block, including assignments
  const openers = ["{", "[", "("];
  const closers = ["}", "]", ")"];
  const openerToCloser: { [key: string]: string } = { "{": "}", "[": "]", "(": ")" };
  function lineHasUnmatchedOpener(text: string): string | null {
    for (let i = 0; i < openers.length; i++) {
      const o = openers[i];
      // Only trigger if opener appears and is not immediately matched on same line
      if (text.includes(o)) {
        let before = text.slice(0, text.indexOf(o));
        // Skip if inside a string literal (simple check)
        if ((before.split('"').length - 1) % 2 === 1 || (before.split("'").length - 1) % 2 === 1) continue;
        // Now check if balanced on this line already
        let openCount = (text.match(new RegExp(`\\${o}`, "g")) || []).length;
        let closeCount = (text.match(new RegExp(`\\${closers[i]}`, "g")) || []).length;
        if (openCount > closeCount) return o;
      }
    }
    return null;
  }
  const opener = lineHasUnmatchedOpener(lineText);
  if (opener) {
    const closer = openerToCloser[opener];
    let blockStart = cursorPosition.line;
    let blockEnd = cursorPosition.line;
    let balance = 0;

    for (let line = cursorPosition.line; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      balance += (text.match(new RegExp(`\\${opener}`, "g")) || []).length;
      balance -= (text.match(new RegExp(`\\${closer}`, "g")) || []).length;
      blockEnd = line;
      if (balance === 0) break;
    }

    let blockText = "";
    for (let line = blockStart; line <= blockEnd; line++) {
      blockText += document.lineAt(line).text + "\n";
    }
    if (moveDown) moveToLineStart(blockEnd + 1);
    return blockText.trimEnd();
  }

  // --------- 3. Function/Class (with decorators) ---------
  const indentLength = currentLine.firstNonWhitespaceCharacterIndex;
  const indent = lineText.slice(0, indentLength);
  const functionPattern = new RegExp(`^${indent}def\\s`);
  const classPattern = new RegExp(`^${indent}class\\s`);
  const decoratorPattern = new RegExp(`^${indent}@`);
  const empty = /^\s*#|^\s*$/;

  if (functionPattern.test(lineText) || classPattern.test(lineText)) {
    let blockStart = cursorPosition.line;
    let blockEnd = cursorPosition.line;

    // Go upwards: include decorators, skip empty lines/comments
    for (let line = cursorPosition.line - 1; line >= 0; line--) {
      const prevText = document.lineAt(line).text;
      if (decoratorPattern.test(prevText)) {
        blockStart = line;
      } else if (empty.test(prevText)) {
        continue;
      } else {
        break;
      }
    }

    // Go downwards: include indented lines (body)
    const blockIndent = indentLength;
    for (let line = cursorPosition.line + 1; line < document.lineCount; line++) {
      const nextText = document.lineAt(line).text;
      if (empty.test(nextText)) continue; // skip empty/comment lines
      const nextIndent = document.lineAt(line).firstNonWhitespaceCharacterIndex;
      if (nextIndent > blockIndent) {
        blockEnd = line;
      } else {
        break;
      }
    }

    let blockText = "";
    for (let line = blockStart; line <= blockEnd; line++) {
      blockText += document.lineAt(line).text + "\n";
    }
    if (moveDown) moveToLineStart(blockEnd + 1);
    return blockText.trimEnd();
  }

  // --------- 4. Decorator block ---------
  if (decoratorPattern.test(lineText)) {
    let blockStart = cursorPosition.line;
    let blockEnd = cursorPosition.line;

    for (let line = cursorPosition.line - 1; line >= 0; line--) {
      const prevText = document.lineAt(line).text;
      if (decoratorPattern.test(prevText)) {
        blockStart = line;
      } else if (empty.test(prevText)) {
        continue;
      } else {
        break;
      }
    }
    for (let line = cursorPosition.line + 1; line < document.lineCount; line++) {
      const nextText = document.lineAt(line).text;
      if (decoratorPattern.test(nextText)) {
        blockEnd = line;
      } else if (empty.test(nextText)) {
        continue;
      } else {
        break;
      }
    }
    let blockText = "";
    for (let line = blockStart; line <= blockEnd; line++) {
      blockText += document.lineAt(line).text + "\n";
    }
    if (moveDown) moveToLineStart(blockEnd + 1);
    return blockText.trimEnd();
  }

  // --------- 5. Single non-empty line ---------
  if (lineText.trim().length > 0) {
    if (moveDown) moveToLineStart(cursorPosition.line + 1);
    return lineText;
  }

  // --------- 6. Blank or comment ---------
  return "";
}



function isInsideMultilineString(
  document: vscode.TextDocument,
  position: vscode.Position
): { startLine: number; endLine: number; quoteType: string } | null {
  const tripleQuotes = ['"""', "'''"];
  let inside = false;
  let quoteType = "";
  let startLine = -1;

  for (let line = 0; line <= position.line; line++) {
    const text = document.lineAt(line).text;
    for (const q of tripleQuotes) {
      let idx = text.indexOf(q);
      while (idx !== -1) {
        if (!inside) {
          inside = true;
          quoteType = q;
          startLine = line;
        } else if (q === quoteType) {
          inside = false;
        }
        idx = text.indexOf(q, idx + q.length);
      }
    }
  }

  if (inside && startLine >= 0) {
    // Find the closing triple quote
    for (let line = position.line + 1; line < document.lineCount; line++) {
      const text = document.lineAt(line).text;
      if (text.includes(quoteType)) {
        return { startLine, endLine: line, quoteType };
      }
    }
    // Unterminated: treat rest of doc as inside string
    return { startLine, endLine: document.lineCount - 1, quoteType };
  }
  return null;
}



function handleMultilineString(
  document: vscode.TextDocument,
  info: { startLine: number; endLine: number; quoteType: string },
  moveDown: boolean
): string {
  let blockText = '';
  for (let line = info.startLine; line <= info.endLine; line++) {
    if (line >= 0 && line < document.lineCount) {
      blockText += document.lineAt(line).text + '\n';
    }
  }
  if (moveDown) {
    const nextLine = info.endLine + 1;
    if (nextLine < document.lineCount) {
      moveToLineStart(nextLine);
    } else {
      insertEmptyLineAtEnd();
      moveToLineStart(nextLine);
    }
  }
  return blockText.trim();
}


function sendToJupyter(code: string) {
  vscode.commands.executeCommand("jupyter.execSelectionInteractive", code);
}
