let dropdownElement: null | HTMLSelectElement = null;
let midi: null | MIDIAccess = null;
let midiInitialised = false;
let midiDevice: undefined | MIDIInput = undefined;
let audioContext: null | AudioContext = null;

let notes = new Array<undefined | OscillatorNode>(128);
let gainNodes = new Array<GainNode>(128);

export function initMidiDropdown(element: HTMLSelectElement) {
    dropdownElement = element;
    dropdownElement.addEventListener("input", (e) => {
        if (e.target === null) {
            return;
        }
        let dropdown = e.target as HTMLSelectElement;
        setupDevice(dropdown.value);
    });
    dropdownElement.addEventListener("click", (_) => {
        if (!midiInitialised) {
            midiInitialised = true;
            navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
        }
    });
}

// Getting MIDI devices
function onMIDISuccess(midiAccess: MIDIAccess) {
    if (dropdownElement === null) {
        return;
    }
    console.log("MIDI ready!");
    midi = midiAccess; // store in the global (in real usage, would probably keep in an object instance)

    // console.log(midiAccess.inputs);
    dropdownElement.innerHTML = "";

    let e = document.createElement("option");
    e.value = "none";
    e.innerHTML = "No Midi Device";
    dropdownElement.appendChild(e);

    for (const entry of midiAccess.inputs) {
        const input = entry[1];
        let e = document.createElement("option");
        e.value = input.id;
        e.innerHTML = input.name ? input.name : input.id;
        dropdownElement.appendChild(e);
    }
}

function onMIDIFailure(msg: string) {
    if (dropdownElement === null || midi == undefined) {
        return;
    }
    console.log(midi.inputs);
    dropdownElement.innerHTML = "";

    let e = document.createElement("option");
    e.value = "none";
    // e.innerHTML = "No Access to MIDI devices";
    e.innerHTML = msg;
    dropdownElement.appendChild(e);

    console.error(`Failed to get MIDI access - ${msg}`);
}

// Setting up a MIDI device
function processMessage(event: MIDIMessageEvent) {
    if (audioContext === null || event.data === null) {
        return;
    }
    if (event.data.length !== 3) {
        let str = `Not sure how to process a midi message of length ${event.data.length}: `;
        for (const character of event.data) {
            str += `0x${character.toString(16)} `;
        }
        console.warn(str);
        return;
    }
    if (event.data[0] === undefined || event.data[1] === undefined || event.data[2] === undefined) {
        return;
    }
    const message_type = event.data[0] >> 4;
    if (message_type === 0x9) {
        const note = event.data[1];
        // console.log(`Note ${note} on, velocity ${event.data[2]}`);
        if (note > 127) {
            console.warn(`Invalid note ${note}`);
            return;
        }

        if (notes[note] !== undefined && notes[note] !== null) {
            notes[note].stop();
            notes[note] = undefined;
        }
        notes[note] = audioContext.createOscillator();

        // Create a gain node just for this note so that we can fade it out
        gainNodes[note] = audioContext.createGain();
        notes[note].connect(gainNodes[note]);
        gainNodes[note].connect(audioContext.destination);
        gainNodes[note].gain.value = event.data[2] / 127;

        notes[note].frequency.value = getFreq(note);
        notes[note].start();
    } else if (message_type === 0x8) {
        const note = event.data[1];
        // console.log(`Note ${event.data[1]} off, velocity ${event.data[2]}`);
        if (note > 127) {
            console.warn(`Invalid note ${note}`);
            return;
        }
        if (notes[note] === undefined) {
            return;
        }

        if (gainNodes[note] !== undefined) {
            // Stop the note over the next 200 ms to avoid crackling
            gainNodes[note].gain.setValueAtTime(gainNodes[note].gain.value, audioContext.currentTime);
            gainNodes[note].gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.02);
        }
    } else {
        console.warn(`Not sure how to process midi command ${message_type}`);
    }
}

function setupDevice(id: string) {
    if (midi === null) {
        console.error(`Failed to setup device ${id} because no midiAccess object is available`);
        return;
    }
    audioContext = new AudioContext();

    // Clear previous device (if applicable)
    if (id === "none") {
        if (midiDevice !== undefined) {
            console.log("Removing previous midi device");
            midiDevice.removeEventListener("midimessage", processMessage);
        }
        midiDevice = undefined;
        return;
    }
    midiDevice = midi.inputs.get(id);
    if (midiDevice === undefined) {
        console.error(`Failed to assign MIDI device with ID ${id}`);
        return;
    }
    midiDevice.addEventListener("midimessage", processMessage);
}

function getFreq(note: number) {
    // 69 is 440Hz
    return 440 * Math.pow(2, (note - 69) / 12);
}
