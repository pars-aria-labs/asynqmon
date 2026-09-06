import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import App from "./App";
import store from "./store";
import parseFlagsUnderWindow from "./parseFlags";
import { saveState } from "./localStorage";
import { SettingsState } from "./reducers/settingsReducer";

parseFlagsUnderWindow();

let currentSettings: SettingsState | undefined = undefined;
store.subscribe(() => {
  const prevSettings = currentSettings;
  currentSettings = store.getState().settings;

  // Write to local-storage only when settings have changed.
  if (prevSettings !== currentSettings) {
    saveState(store.getState());
  }
});

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
