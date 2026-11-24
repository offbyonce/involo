// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

export function reloadOnTakeover(workers: ServiceWorkerContainer, reload: () => void): void;
export function watchForUpdates(
  workers: ServiceWorkerContainer,
  registration: ServiceWorkerRegistration,
  offer: (worker: ServiceWorker) => void,
): void;
