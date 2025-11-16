export function createRTIOWScene(): Float32Array {
	const sphereSize = 12;
	const sphereMaxCount = 4 + 22 * 22;

	const sceneArray = new Float32Array(sphereSize * sphereMaxCount);

	sceneArray[0] = 0.0; // Center x
	sceneArray[1] = -1000.0; // Center y
	sceneArray[2] = -1.0; // Center z
	sceneArray[3] = 1000.0; // Radius
	sceneArray[4] = 0.5; // Albedo R
	sceneArray[5] = 0.5; // Albedo G
	sceneArray[6] = 0.5; // Albedo B
	sceneArray[7] = 1.0; // Material
	sceneArray[8] = 0.0; // Refraction index

	sceneArray[12] = 0.0; // Center x
	sceneArray[13] = 1.0; // Center y
	sceneArray[14] = 0.0; // Center z
	sceneArray[15] = 1.0; // Radius
	sceneArray[16] = 1.0; // Albedo R
	sceneArray[17] = 1.0; // Albedo G
	sceneArray[18] = 1.0; // Albedo B
	sceneArray[19] = 2.0; // Material
	sceneArray[20] = 0.67; // Refraction index

	sceneArray[24] = -4.0; // Center x
	sceneArray[25] = 1.0; // Center y
	sceneArray[26] = 0.0; // Center z
	sceneArray[27] = 1.0; // Radius
	sceneArray[28] = 0.4; // Albedo R
	sceneArray[29] = 0.2; // Albedo G
	sceneArray[30] = 0.1; // Albedo B
	sceneArray[31] = 0.0; // Material
	sceneArray[32] = 0.67; // Refraction index

	sceneArray[36] = 4.0; // Center x
	sceneArray[37] = 1.0; // Center y
	sceneArray[38] = 0.0; // Center z
	sceneArray[39] = 1.0; // Radius
	sceneArray[40] = 0.7; // Albedo R
	sceneArray[41] = 0.6; // Albedo G
	sceneArray[42] = 0.5; // Albedo B
	sceneArray[43] = 1.0; // Material
	sceneArray[44] = 0.67; // Refraction index

	let sphereNum = 4;
	const spheresPerQuadrant = 11;
	// const spheresPerQuadrant = 5;
	for (let a = -spheresPerQuadrant; a < spheresPerQuadrant; a++) {
		for (let b = -spheresPerQuadrant; b < spheresPerQuadrant; b++) {
			sceneArray[sphereNum * sphereSize + 0] = a + 0.9 * Math.random(); // Center x
			sceneArray[sphereNum * sphereSize + 1] = 0.2; // Center y
			sceneArray[sphereNum * sphereSize + 2] = b + 0.9 * Math.random(); // Center z
			sceneArray[sphereNum * sphereSize + 3] = 0.2; // Radius
			sceneArray[sphereNum * sphereSize + 4] = Math.random(); // Albedo R
			sceneArray[sphereNum * sphereSize + 5] = Math.random(); // Albedo G
			sceneArray[sphereNum * sphereSize + 6] = Math.random(); // Albedo B
			sceneArray[sphereNum * sphereSize + 7] = Math.trunc(Math.random() * 3); // Material
			sceneArray[sphereNum * sphereSize + 8] = 1 / 1.5; // Refraction index

			sphereNum++;
		}
	}

	return sceneArray;
}
