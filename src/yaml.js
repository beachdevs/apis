const yaml = globalThis.Bun?.YAML;

export const parseYaml = (input) => {
  if (!yaml?.parse) throw new Error('YAML parsing requires Bun runtime');
  return yaml.parse(input);
};

export const stringifyYaml = (input) => {
  if (!yaml?.stringify) throw new Error('YAML stringifying requires Bun runtime');
  return yaml.stringify(input);
};
