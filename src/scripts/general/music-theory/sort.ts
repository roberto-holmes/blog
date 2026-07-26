export function quicksort(array: number[], sorted: number[][], startIndex: number, endIndex: number, pivotIndex: number) {
    const initialPivot = array[pivotIndex] as number;
    let pivot = [initialPivot];
    let less = [];
    let more = [];

    // Check the pivot against every value in this section
    for (let i = startIndex; i < endIndex; i++) {
        const v = array[i] as number;

        // Compare
        if (v < (pivot[0] as number)) {
            // Add to left list
            less.push(v);
        } else if (v > (pivot[0] as number)) {
            // Add to right list
            more.push(v);
        } else {
            // It is the same
            pivot.push(v);
        }
    }
    // Remove the initial pivot from the array as it will have been added again when doing comparisons
    pivot.splice(pivot.indexOf(initialPivot), 1);

    switch (less.length) {
        case 0:
            break;
        case 1:
            sorted.push([less[0] as number]);
            break;
        default:
            quicksort(less, sorted, 0, less.length, Math.floor(less.length / 2));
    }
    sorted.push(pivot);
    // Sorted array now includes the less side and the pivot
    switch (more.length) {
        case 0:
            break;
        case 1:
            sorted.push([more[0] as number]);
            break;
        default:
            quicksort(more, sorted, 0, more.length, Math.floor(more.length / 2));
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
    isComplete(): boolean {
        return this.values.length === this.sameCount + 1;
    }
}

export function stacklessSort(array: number[]): Bin[] {
    let sorted = [new Bin(array)];

    let currentBin = 0;

    // Keep track of if the current bin has create bins for the values that are smaller and bigger than the pivot
    let lessBin = false;
    let moreBin = false;

    let loopCount = 0;

    while (true) {
        loopCount++;
        if (sorted[currentBin] === undefined) {
            break;
        }
        if (sorted[currentBin]?.isComplete()) {
            currentBin++;
            continue;
        }

        // Check if current bin is sorted
        const pivot = sorted[currentBin]?.getPivot() as number;
        // Perform comparison
        let v = sorted[currentBin]?.popNextValue() as number;

        if (v < pivot) {
            if (lessBin === false) {
                sorted.splice(currentBin, 0, new Bin([v]));
                lessBin = true;
                currentBin++;
            } else {
                sorted[currentBin - 1]?.push(v);
            }
        } else if (v > pivot) {
            if (moreBin === false) {
                sorted.splice(currentBin + 1, 0, new Bin([v]));
                moreBin = true;
            } else {
                sorted[currentBin + 1]?.push(v);
            }
        } else {
            sorted[currentBin]?.addSame(v);
        }

        // Check if bin is complete
        if (sorted[currentBin]?.isComplete()) {
            // If it is, then reset the counter so that we can find the bin with the lowest values
            currentBin = 0;
            lessBin = false;
            moreBin = false;
        }
    }

    let goodSort = true;
    for (const bin of sorted) {
        let same = 0;
        if (bin.values.length !== 0) {
            same = bin.values[0] as number;
        }
        let sameCount = 0;
        for (const v of bin.values) {
            if (v === same) {
                sameCount++;
            } else {
                goodSort = false;
            }
        }
    }

    console.log(`Sorted in ${loopCount} loops`);
    if (!goodSort) {
        console.error("Failed to sort correctly");
    }

    return sorted;
}
