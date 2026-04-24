import { useCallback, useEffect, useState } from "react";

import type { PlayerRuntimeBootstrap } from "@ocnoer/story-core";

import type { MobileRuntimeConfig } from "../config/runtime";
import { createMobileRuntimeRepository } from "../runtime/runtimeRepository";

export type RuntimeBootstrapState =
  | {
      status: "loading";
    }
  | {
      status: "error";
      message: string;
    }
  | {
      status: "success";
      config: MobileRuntimeConfig;
      bootstrap: PlayerRuntimeBootstrap;
    };

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to load the published runtime.";
}

export function useRuntimeBootstrap() {
  const [state, setState] = useState<RuntimeBootstrapState>({
    status: "loading"
  });

  const reload = useCallback(async () => {
    setState({
      status: "loading"
    });

    try {
      const repository = createMobileRuntimeRepository();
      const bootstrap = await repository.loadBootstrap();

      setState({
        status: "success",
        config: repository.config,
        bootstrap
      });
    } catch (error) {
      setState({
        status: "error",
        message: getErrorMessage(error)
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    state,
    reload
  };
}
