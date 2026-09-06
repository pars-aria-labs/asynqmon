// Prefix used for Go templates.
const goTemplateActionPrefix = "/[[";

// Parses the string flags assigned to window by the Go server.
export default function parseFlagsUnderWindow() {
  // ROOT_PATH
  if (window.FLAG_ROOT_PATH === undefined) {
    console.log("ROOT_PATH is not defined. Falling back to an empty string");
    window.ROOT_PATH = "";
  } else {
    window.ROOT_PATH = window.FLAG_ROOT_PATH;
  }

  // PROMETHEUS_CONFIGURED
  if (window.FLAG_PROMETHEUS_CONFIGURED === undefined) {
    console.log(
      "PROMETHEUS_CONFIGURED is not defined. Falling back to false",
    );
    window.PROMETHEUS_CONFIGURED = false;
  } else if (
    window.FLAG_PROMETHEUS_CONFIGURED.startsWith(goTemplateActionPrefix)
  ) {
    console.log(
      "PROMETHEUS_CONFIGURED was not evaluated by the server. Falling back to false",
    );
    window.PROMETHEUS_CONFIGURED = false;
  } else {
    window.PROMETHEUS_CONFIGURED =
      window.FLAG_PROMETHEUS_CONFIGURED === "true";
  }

  // READ_ONLY
  if (window.FLAG_READ_ONLY === undefined) {
    console.log("READ_ONLY is not defined. Falling back to false");
    window.READ_ONLY = false;
  } else if (window.FLAG_READ_ONLY.startsWith(goTemplateActionPrefix)) {
    console.log(
      "READ_ONLY was not evaluated by the server. Falling back to false",
    );
    window.READ_ONLY = false;
  } else {
    window.READ_ONLY = window.FLAG_READ_ONLY === "true";
  }
}
