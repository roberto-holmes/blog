import { Chart } from "chart.js/auto"; // Import everything and disallow tree shaking (for development)
import { getRelativePosition } from "chart.js/helpers";
// import { Chart, CategoryScale, LinearScale, ScatterController, LineController, PointElement, LineElement } from "chart.js";
// Chart.register(CategoryScale, LinearScale, ScatterController, LineController, PointElement, LineElement);

enum Screen {
    Start,
    Game,
    Chart,
}

function switchScreen(newScreen: Screen) {
    let start_el = document.querySelectorAll(".start");
    let game_el = document.querySelectorAll(".game");
    let chart_el = document.querySelectorAll(".chart");
    if (newScreen == Screen.Start) {
        console.debug("Switching to start screen");
        for (let i = 0; i < start_el.length; i++) {
            (start_el[i] as Element).classList.remove("hide");
        }
        for (let i = 0; i < game_el.length; i++) {
            (game_el[i] as Element).classList.add("hide");
        }
        for (let i = 0; i < chart_el.length; i++) {
            (chart_el[i] as Element).classList.add("hide");
        }
    } else if (newScreen == Screen.Game) {
        console.debug("Switching to game screen");
        for (let i = 0; i < start_el.length; i++) {
            (start_el[i] as Element).classList.add("hide");
        }
        for (let i = 0; i < game_el.length; i++) {
            (game_el[i] as Element).classList.remove("hide");
        }
        for (let i = 0; i < chart_el.length; i++) {
            (chart_el[i] as Element).classList.add("hide");
        }
    } else if (newScreen == Screen.Chart) {
        console.debug("Switching to chart screen");
        for (let i = 0; i < start_el.length; i++) {
            (start_el[i] as Element).classList.add("hide");
        }
        for (let i = 0; i < game_el.length; i++) {
            (game_el[i] as Element).classList.add("hide");
        }
        for (let i = 0; i < chart_el.length; i++) {
            (chart_el[i] as Element).classList.remove("hide");
        }
    }
}

class Tone {
    context: AudioContext;
    osc: OscillatorNode;
    gainNode: GainNode;
    notesInFlight: number;
    constructor(context: AudioContext) {
        this.context = context;
        this.osc = this.context.createOscillator();
        this.gainNode = this.context.createGain();
        this.notesInFlight = 0;
        this.init();
    }
    init() {
        if (this.notesInFlight > 0) {
            this.osc.stop();
        }
        this.osc = this.context.createOscillator();
        this.gainNode = this.context.createGain();
        this.osc.connect(this.gainNode);
        this.gainNode.connect(this.context.destination);
    }
    play(freq: number, gain: number, duration_ms: number) {
        // console.log(`Playing a tone at ${freq} Hz for ${duration_ms} ms`);
        this.init();
        this.gainNode.gain.value = gain;
        this.osc.frequency.value = freq;
        this.osc.start();
        this.notesInFlight++;
        const release_ms = 50;
        setTimeout(() => {
            if (this.notesInFlight == 1) {
                this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, this.context.currentTime);
                this.gainNode.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + release_ms / 1000);
            }
            this.notesInFlight--;
        }, duration_ms - release_ms);
    }
}

class Bin {
    sameCount: number;
    values: number[];
    constructor(array: number[]) {
        this.sameCount = 0;
        this.values = array;
    }
    push(value: number) {
        this.values.push(value);
    }
    pushArray(array: number[]) {
        this.values.push.apply(this.values, array);
    }
    addSame(value: number) {
        this.values.push(value);
        this.sameCount++;
    }
    getPivot(): number {
        if (this.values[0] === undefined) {
            console.error("tried to get the pivot of an empty bin");
            return 0;
        }
        return this.values[0];
    }
    popNextValue(): number {
        // let v = this.values[this.sameCount + 1] as number;
        // this.values.splice(this.sameCount + 1, 1);
        let v = this.values[1] as number;
        this.values.splice(1, 1);
        return v;
    }
    getNextValue(): number {
        return this.values[1] as number;
    }
    isComplete(): boolean {
        return this.values.length === this.sameCount + 1;
    }
}

class Game {
    context: AudioContext;
    counter: HTMLElement;

    currentRound: number;
    maxRounds: number;

    // Variables for keeping track of the sorting
    sortingArray: Bin[];
    sortingCurrentBin: number;
    // Keep track of if the current bin has created bins for the values that are smaller and bigger than the pivot
    sortingLessBin: boolean;
    sortingMoreBin: boolean;
    sortingComplete: boolean;

    finished: boolean;

    buttons: HTMLElement[];
    volumeSlider: HTMLInputElement;

    tone1: Tone;
    tone2: Tone;

    chart: Chart;
    constructor(context: AudioContext, intervalCount_Bins: number | Bin[]) {
        this.context = context;
        this.counter = document.getElementById("counter") as HTMLElement;
        this.volumeSlider = document.getElementById("volume") as HTMLInputElement;

        this.tone1 = new Tone(context);
        this.tone2 = new Tone(context);

        if (typeof intervalCount_Bins == "number") {
            let intervalCount = intervalCount_Bins;
            let intervals = [];
            for (let i = 0; i <= 1.0; i += 1.0 / intervalCount) {
                intervals.push(i);
            }
            // We actually have one more interval because we need to count the interval 0
            intervalCount++;

            this.currentRound = 0;
            this.maxRounds = (intervalCount * (intervalCount - 1)) / 2;

            console.log(`Max tests: ${this.maxRounds}`);

            // Fisher–Yates shuffle
            let currentIndex = intervals.length;
            while (currentIndex != 0) {
                // Pick a remaining element...
                let randomIndex = Math.floor(Math.random() * currentIndex--);

                if (intervals[currentIndex] === undefined || intervals[randomIndex] === undefined) {
                    console.warn("Issue with shuffling intervals");
                    break;
                }
                // And swap it with the current element.
                [intervals[currentIndex], intervals[randomIndex]] = [intervals[randomIndex], intervals[currentIndex] as number];
            }

            // Prepare the data structure for sorting the intervals
            this.sortingArray = [new Bin(intervals)];
        } else {
            // If we are recovering then just copy over values
            console.log("Recovering sorted values");
            this.sortingArray = intervalCount_Bins;
            // Init remaining member variables (they won't be used but we want to keep the compiler happy)
            this.currentRound = 0;
            this.maxRounds = 0;
        }

        // Prepare rest of sorting variables
        this.sortingCurrentBin = 0;
        this.sortingLessBin = false;
        this.sortingMoreBin = false;
        this.sortingComplete = false;
        this.finished = false;

        console.log(this.sortingArray);

        this.buttons = [
            document.getElementById("selector-A") as HTMLElement,
            document.getElementById("selector-B") as HTMLElement,
            document.getElementById("selector-same") as HTMLElement,
        ];

        (this.buttons[0] as HTMLElement).addEventListener("click", () => {
            this.select("1");
        });
        (this.buttons[1] as HTMLElement).addEventListener("click", () => {
            this.select("2");
        });
        (this.buttons[2] as HTMLElement).addEventListener("click", () => {
            this.select("3");
        });

        const ctx = document.getElementById("result-chart") as HTMLCanvasElement;
        this.chart = new Chart(ctx, {
            type: "scatter",
            data: {
                datasets: [
                    {
                        data: [],
                    },
                ],
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            display: false,
                        },
                    },
                    x: {
                        beginAtZero: true,
                        suggestedMax: 1.0,
                    },
                },
                elements: {
                    line: {
                        tension: 0.4,
                    },
                },
                plugins: {
                    legend: {
                        display: false,
                    },
                },
                onClick: (e) => {
                    const canvasPosition = getRelativePosition(e, this.chart);

                    // Substitute the appropriate scale IDs
                    const dataX = this.chart.scales.x?.getValueForPixel(canvasPosition.x);

                    if (dataX) this.playInterval(dataX, 0, 250);

                    // console.log(dataX + ", " + dataY);
                },
                backgroundColor: "rgb(255, 99, 132)",
                showLine: true, // Line of "best fit"
                responsive: true, // Change size automatically
                maintainAspectRatio: false, // Allow bounding box to change
                animation: false,
            },
        });
    }
    // updateCounter() {
    //     while (true) {
    //         if (this.sortingArray[this.sortingCurrentBin] === undefined) {
    //             console.log("Complete");
    //             // TODO
    //             return;
    //         }
    //         if (this.sortingArray[this.sortingCurrentBin]?.isComplete()) {
    //             this.sortingCurrentBin++;
    //         } else {
    //             // We have found a bin that still needs sorting
    //             break;
    //         }
    //     }

    //     // TODO: Update max rounds
    //     let remainingIntervals = 0;
    //     for (let i = this.sortingCurrentBin; i < (this.sortingArray.length as number); i++) {
    //         remainingIntervals += this.sortingArray[this.sortingCurrentBin]?.values.length as number;
    //     }
    //     this.maxRounds = (remainingIntervals * (remainingIntervals - 1)) / 2;

    //     this.counter.innerHTML = `${this.currentRound}/${this.maxRounds}`;
    // }
    play() {
        while (true) {
            // Go through all of the bins of notes looking for any taht remain unsorted
            if (this.sortingArray[this.sortingCurrentBin] === undefined) {
                // We have checked all bins
                this.sortingComplete = true;
                this.finish();
                // TODO
                return;
            }
            if (this.sortingArray[this.sortingCurrentBin]?.isComplete()) {
                this.sortingCurrentBin++;
            } else {
                // We have found a bin that still needs sorting
                break;
            }
        }

        // TODO: Update max rounds
        let remainingIntervals = 0;
        for (let i = this.sortingCurrentBin; i < (this.sortingArray.length as number); i++) {
            remainingIntervals += this.sortingArray[this.sortingCurrentBin]?.values.length as number;
        }
        this.maxRounds = (remainingIntervals * (remainingIntervals - 1)) / 2;

        // Update counter that is visible to the user
        this.counter.innerHTML = `${this.currentRound}/${this.maxRounds}`;

        // const currentRound = this.rounds[this.currentRound] as number[];
        const noteDuration_ms = 750;
        // Play the first sound
        this.playInterval(this.sortingArray[this.sortingCurrentBin]?.getNextValue() as number, 0, noteDuration_ms);
        (this.buttons[0] as HTMLElement).classList.add("playing");
        setTimeout(() => {
            (this.buttons[0] as HTMLElement).classList.remove("playing");
        }, noteDuration_ms);
        // Play the second sound
        this.playInterval(this.sortingArray[this.sortingCurrentBin]?.getPivot() as number, noteDuration_ms + 250, noteDuration_ms);
        setTimeout(() => {
            (this.buttons[1] as HTMLElement).classList.add("playing");
        }, noteDuration_ms + 250);
        setTimeout(
            () => {
                (this.buttons[1] as HTMLElement).classList.remove("playing");
            },
            2 * noteDuration_ms + 250,
        );
    }
    playInterval(interval: number, delay_ms: number, note_duration_ms: number, baseFreq = 440) {
        // Interval is a number between 0 and 1 where 0 is the same note as baseFreq and 1 is twice the frequency
        const intervalFreq = baseFreq * Math.pow(2, interval);
        // console.log(`Playing ${interval} interval in ${delay_ms} ms`);
        return new Promise(() => {
            setTimeout(() => {
                const volume = Number(this.volumeSlider.value);
                this.tone1.play(baseFreq, volume, note_duration_ms);
                this.tone2.play(intervalFreq, volume, note_duration_ms);
            }, delay_ms);
        });
    }
    select(key: string) {
        if (this.sortingComplete) {
            this.finish();
            return;
        }
        // Check if current bin is sorted
        // const pivot = this.sortingArray[this.sortingCurrentBin]?.getPivot() as number;
        // Perform comparison
        let v = this.sortingArray[this.sortingCurrentBin]?.popNextValue() as number;

        let element;
        switch (key) {
            case "1":
                element = this.buttons[0];
                if (this.sortingLessBin === false) {
                    this.sortingArray.splice(this.sortingCurrentBin, 0, new Bin([v]));
                    this.sortingLessBin = true;
                    this.sortingCurrentBin++;
                } else {
                    this.sortingArray[this.sortingCurrentBin - 1]?.push(v);
                }
                break;
            case "2":
                element = this.buttons[1];
                if (this.sortingMoreBin === false) {
                    this.sortingArray.splice(this.sortingCurrentBin + 1, 0, new Bin([v]));
                    this.sortingMoreBin = true;
                } else {
                    this.sortingArray[this.sortingCurrentBin + 1]?.push(v);
                }
                break;
            case "3":
                element = this.buttons[2];
                this.sortingArray[this.sortingCurrentBin]?.addSame(v);
                break;
            case " ":
                this.play();
                return;
            default:
                return;
        }
        if (element === undefined) {
            return;
        }

        element.classList.add("selected");
        setTimeout(() => {
            element.classList.remove("selected");
        }, 100);

        // Check if bin is complete
        if (this.sortingArray[this.sortingCurrentBin]?.isComplete()) {
            // If it is, then reset the counter so that we can find the bin with the lowest values
            this.sortingCurrentBin = 0;
            this.sortingLessBin = false;
            this.sortingMoreBin = false;
        }

        this.currentRound++;

        this.play();
    }
    finish() {
        // Make sure this function can only be called once
        if (this.finished) {
            return;
        }
        this.finished = true;

        console.info("Game complete");
        // Convert the data to base64
        console.log(btoa(JSON.stringify(this.sortingArray)));

        let points: { x: number; y: number }[] = [];
        let currentY = 0;
        this.sortingArray.forEach((bin) => {
            bin.values.forEach((value) => {
                points.push({ x: value, y: currentY });
            });
            currentY += 0.1;
        });

        // Sort the points in ascending x order so that the line connecting them makes (some) sense
        points.sort((a, b) => a.x - b.x);

        // Add our data points to the graph
        this.chart.data.datasets.forEach((dataset) => {
            points.forEach((point) => {
                dataset.data.push(point);
            });
        });
        console.log(this.chart.data.datasets);
        this.chart.update("none"); // Update without animations

        switchScreen(Screen.Chart);
    }
}

export function initGame() {
    console.log("Initialising game");
    let audioContext = new AudioContext();
    let game = new Game(audioContext, 10);

    document.addEventListener("keydown", (e) => {
        game.select(e.key);
    });

    // Set up so that the play button will play the sounds
    (document.getElementById("repeat") as HTMLElement).addEventListener("click", (_) => {
        game.play();
    });

    switchScreen(Screen.Game);
    game.play();
}

export function recover() {
    let recovery_input = document.getElementById("recovery-code") as HTMLInputElement;

    if (recovery_input.value === "") {
        recovery_input.style.color = "black";
        return;
    }

    try {
        let recovered_results = JSON.parse(atob(recovery_input.value));
        console.log(recovered_results);
        let audioContext = new AudioContext();
        let game = new Game(audioContext, recovered_results);
        game.finish();
    } catch (e) {
        // Notify that the given value is invalid
        recovery_input.style.color = "red";
    }
}
