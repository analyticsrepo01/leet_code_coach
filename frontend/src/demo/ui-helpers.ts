export async function populateDevices(
  settingsModal: HTMLDivElement,
  selectedAudioDeviceId: string,
  selectedVideoDeviceId: string,
  selectedSpeakerDeviceId: string,
  updateSpeakerDevice: (deviceId: string) => Promise<void>,
) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioSelect = settingsModal.querySelector(
    '#audioDeviceSelect',
  ) as HTMLSelectElement;
  const videoSelect = settingsModal.querySelector(
    '#videoDeviceSelect',
  ) as HTMLSelectElement;
  const speakerSelect = settingsModal.querySelector(
    '#speakerDeviceSelect',
  ) as HTMLSelectElement;

  if (audioSelect) {
    audioSelect.innerHTML = '';
    devices
      .filter(d => d.kind === 'audioinput')
      .forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Mic ${audioSelect.options.length + 1}`;
        audioSelect.appendChild(opt);
      });
    if (!selectedAudioDeviceId && audioSelect.options.length > 0) {
      const hasDefault = Array.from(audioSelect.options).some(
        opt => opt.value === 'default',
      );
      selectedAudioDeviceId = hasDefault
        ? 'default'
        : audioSelect.options[0].value;
    }
    audioSelect.value = selectedAudioDeviceId;
    audioSelect.onchange = () => {
      selectedAudioDeviceId = audioSelect.value;
    };
  }

  if (videoSelect) {
    videoSelect.innerHTML = '';
    devices
      .filter(d => d.kind === 'videoinput')
      .forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Camera ${videoSelect.options.length + 1}`;
        videoSelect.appendChild(opt);
      });
    if (!selectedVideoDeviceId && videoSelect.options.length > 0) {
      const hasDefault = Array.from(videoSelect.options).some(
        opt => opt.value === 'default',
      );
      selectedVideoDeviceId = hasDefault
        ? 'default'
        : videoSelect.options[0].value;
    }
    videoSelect.value = selectedVideoDeviceId;
    videoSelect.onchange = () => {
      selectedVideoDeviceId = videoSelect.value;
    };
  }

  if (speakerSelect) {
    speakerSelect.innerHTML = '';
    devices
      .filter(d => d.kind === 'audiooutput')
      .forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent =
          d.label || `Speaker ${speakerSelect.options.length + 1}`;
        speakerSelect.appendChild(opt);
      });
    if (!selectedSpeakerDeviceId && speakerSelect.options.length > 0) {
      const hasDefault = Array.from(speakerSelect.options).some(
        opt => opt.value === 'default',
      );
      selectedSpeakerDeviceId = hasDefault
        ? 'default'
        : speakerSelect.options[0].value;
    }
    speakerSelect.value = selectedSpeakerDeviceId;
    speakerSelect.onchange = async () => {
      selectedSpeakerDeviceId = speakerSelect.value;
      await updateSpeakerDevice(speakerSelect.value);
    };
  }

  return {
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    selectedSpeakerDeviceId,
  };
}

export function showMessageModal(title: string, text: string) {
  const modal = document.getElementById('messageModal') as HTMLDivElement;
  const modalTitle = document.getElementById(
    'messageModalTitle',
  ) as HTMLHeadingElement;
  const modalText = document.getElementById(
    'messageModalText',
  ) as HTMLParagraphElement;
  const closeBtn = document.getElementById(
    'closeMessageModalBtn',
  ) as HTMLButtonElement;

  if (modal && modalTitle && modalText && closeBtn) {
    modalTitle.textContent = title;
    modalText.textContent = text;
    modal.classList.add('active');

    closeBtn.onclick = () => {
      modal.classList.remove('active');
    };
  } else {
    // Fallback to alert if elements not found
    alert(text);
  }
}
