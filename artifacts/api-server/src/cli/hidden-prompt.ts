import { emitKeypressEvents } from "node:readline";

export function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Se requiere una terminal interactiva.");
  }
  return new Promise((resolve, reject) => {
    emitKeypressEvents(process.stdin);
    const previousRawMode = process.stdin.isRaw ?? false;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let value = "";
    process.stdout.write(label);

    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(previousRawMode);
      process.stdin.pause();
      process.stdout.write("\n");
    };
    const onKeypress = (text: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && (key.name === "c" || key.name === "d")) {
        cleanup();
        reject(new Error("Operación cancelada."));
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(value);
      } else if (key.name === "backspace") {
        value = value.slice(0, -1);
      } else if (!key.ctrl && text) {
        value += text;
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}