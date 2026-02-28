const text = "Some long text here " + "```\n" + "test ".repeat(10000) + "\n```";
let cleaned = text.trim();
cleaned = cleaned.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
console.log("no hang");
