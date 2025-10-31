# Run in Jupyter python-codesitter

- Forked from xororz run-in-jupyter found here https://github.com/xororz/run-in-jupyter

A Visual Studio Code extension that allows you to execute Python code blocks in a Jupyter interactive window by inferring the relevant block at the cursor position using the `tree-sitter` parser. The extension supports running selected code or automatically detecting Python blocks (e.g., functions, loops, conditionals) and moves the cursor to the next executable line after execution.

## Features

- **Run Selected Code**: Execute highlighted Python code in the Jupyter interactive window.
- **Infer Python Blocks**: Automatically detect and run the Python code block (e.g., `if`, `for`, `function_definition`) at the cursor position using `tree-sitter`.
- **Move Cursor**: After execution, move the cursor to the next non-empty, non-comment line, preserving indentation.
- **Compound Block Support**: Handles complex Python constructs like `if/elif/else` and `try/except/finally` by including all related clauses.
- **Error Handling**: Provides user-friendly error messages for cases like missing Jupyter extension or invalid Python code.

## Requirements

- **Visual Studio Code**: Version 1.60.0 or higher.
- **Jupyter Extension**: The [Jupyter extension for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) must be installed and active.
- **Python**: A Python environment configured in VS Code for Jupyter integration.
- **Node.js**: Required for building the extension (version 16 or higher recommended).

## Usage

1. **Open a Python File**: Open a `.py` file in VS Code.
2. **Select Code (Optional)**: Highlight the code you want to execute, or place the cursor within a Python block.
3. **Run the Command**:
   - Use the Command Palette (`Ctrl+Shift+P`) and select `Run in Jupyter: Run and Move Down`.
   - Alternatively, bind the command `python-codesitter.runAndMoveDown` to a keybinding (e.g., `Shift+Enter`).
4. **Behavior**:
   - If code is selected, it will be sent to the Jupyter interactive window.
   - If no code is selected, the extension infers the Python block at the cursor (e.g., function, loop, or statement) and executes it.
   - After execution, the cursor moves to the next non-empty, non-comment line, aligning with the indentation of the new line.

### Example

```python
# example.py
def greet(name):
    print(f"Hello, {name}!")

if True:
    x = 10
    print(x)
```

- Place the cursor on `print(f"Hello, {name}!")` and run the command. The entire `greet` function will be sent to Jupyter.
- Select `x = 10` and run the command. Only the selected line will be executed.
- Place the cursor in the `if` block. The entire `if` block (including `x = 10` and `print(x)`) will be executed.

## Configuration

The extension currently has no configurable settings. Future updates may include options to:
- Toggle cursor movement after execution.
- Customize executable block types.
- Support Jupyter cell markers (`# %%`).

## Development

### Prerequisites

- Install Node.js dependencies:
  ```bash
  npm install tree-sitter tree-sitter-python @types/vscode @types/node
  ```

### Building

- Compile TypeScript to JavaScript:
  ```bash
  npm run compile
  ```

- Package the extension:
  ```bash
  npm run package
  ```

### Testing

- Run the extension in the VS Code Extension Development Host by pressing `F5`.
- Test with various Python files, including:
  - Empty files.
  - Files with nested blocks (e.g., `if` inside `for`).
  - Files with comments or whitespace.
  - Invalid Python code to verify error handling.

### Dependencies

- `tree-sitter`: For parsing Python code.
- `tree-sitter-python`: Python grammar for `tree-sitter`.
- `@types/vscode`: Type definitions for the VS Code API.
- `@types/node`: Type definitions for Node.js.

## Known Issues

- The extension requires the Jupyter extension to be installed and active.
- Large Python files may experience slower parsing due to `tree-sitter`. Future updates may implement incremental parsing.
- Limited support for Jupyter cell markers (`# %%`). This may be added in future versions.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Make your changes and commit (`git commit -m "Add your feature"`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a Pull Request.

Please include tests and update the documentation as needed.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgements

- Built with [tree-sitter](https://tree-sitter.github.io/) for Python parsing.
- Integrates with the [Jupyter VS Code extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter).

---

Feel free to customize the repository URL, license, and other details to match your project. If you need additional sections (e.g., troubleshooting, changelog, or specific contribution guidelines), let me know, and I can expand the `README.md` further!