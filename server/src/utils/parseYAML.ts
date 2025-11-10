import yaml from "yaml";

export default function parseYAML(content: string) {
    return yaml.parse(content);
}
