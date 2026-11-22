/** Launching a patrol always requires an explicit command from the briefing. */
export function bindBriefingNavigation(
  dialog: HTMLDialogElement,
  beginPatrol: () => void,
  continuePatrol: () => void,
  afterDismiss: () => void,
): void {
  const button = (id: string) => dialog.querySelector<HTMLButtonElement>('#' + id)!;

  function dismiss() {
    dialog.close();
    afterDismiss();
  }

  button('start').addEventListener('click', beginPatrol);
  button('resume').addEventListener('click', continuePatrol);
  button('close-briefing').addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dismiss();
  });
}
