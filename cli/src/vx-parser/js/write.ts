import { writeFileSync, readFileSync } from "fs";
import { dump } from "@hyrious/marshal";
import { getValueBySymbolDesc, setValueBySymbolDesc } from "./symbol-utils";

function mergeSeq(json: object[]): object[] {
    let first: null | number = null;
    let number: number = -1;
    let prev: boolean = false;
    const stringArray: string[] = [];

    for (let i = 0; i < json.length; i++) {
        const object: object = json[i];
        const code: number = getValueBySymbolDesc(object, "@code");

        if (code === 401) {
            if (first === null) {
                first = i;
            }

            number += 1;
            stringArray.push(getValueBySymbolDesc(object, "@parameters")[0]);
            prev = true;
        } else if (i > 0 && prev && first !== null && number !== -1) {
            const parameters = getValueBySymbolDesc(json[first], "@parameters");
            parameters[0] = stringArray.join("\n");
            setValueBySymbolDesc(json[first], "@parameters", parameters);

            const startIndex: number = first + 1;
            const itemsToDelete: number = startIndex + number;
            json.splice(startIndex, itemsToDelete);

            stringArray.length = 0;
            i -= number;
            number = -1;
            first = null;
            prev = false;
        }
    }

    return json;
}

export function mergeMap(json: object[]): object[] {
    const events: object = getValueBySymbolDesc(json, "@events");

    for (const event of Object.values(events)) {
        const pages: object[] = getValueBySymbolDesc(event, "@pages");
        if (!pages) {
            continue;
        }

        for (const page of pages) {
            const list: object[] = getValueBySymbolDesc(page, "@list");
            setValueBySymbolDesc(page, "@list", mergeSeq(list));
        }
    }

    return json;
}

export function mergeOther(json: object[]): object[] {
    for (const element of json) {
        const pages: object[] = getValueBySymbolDesc(element, "@pages");

        if (Array.isArray(pages)) {
            for (const page of pages) {
                const list: object[] = getValueBySymbolDesc(page, "@list");
                setValueBySymbolDesc(page, "@list", mergeSeq(list));
            }
        } else {
            const list: object[] = getValueBySymbolDesc(element, "@list");

            if (Array.isArray(list)) {
                setValueBySymbolDesc(element, "@list", mergeSeq(list));
            }
        }
    }

    return json;
}

export function writeMap(
    json: any,
    outputDir: string,
    textMap: Map<string, string>,
    namesMap: Map<string, string>,
    logging: boolean,
    logString: string
): void {
    for (const [f, file] of json) {
        const displayName: string = getValueBySymbolDesc(file, "@display_name");

        if (namesMap.has(displayName)) {
            setValueBySymbolDesc(file, "@display_name", namesMap.get(displayName)!);
        }

        const events: object = getValueBySymbolDesc(file, "@events");

        for (const event of Object.values(events)) {
            const pages: object[] = getValueBySymbolDesc(event, "@pages");
            if (!pages) {
                return;
            }

            for (const page of pages) {
                const list: object[] = getValueBySymbolDesc(page, "@list");

                for (const item of list || []) {
                    const code: number = getValueBySymbolDesc(item, "@code");
                    const parameters: string[] = getValueBySymbolDesc(item, "@parameters");

                    for (const [i, parameter] of parameters.entries()) {
                        if (typeof parameter === "string") {
                            if (
                                [401, 402, 324].includes(code) ||
                                (code === 356 &&
                                    (parameter.startsWith("GabText") ||
                                        (parameter.startsWith("choice_text") && !parameter.endsWith("????"))))
                            ) {
                                if (textMap.has(parameter)) {
                                    parameters[i] = textMap.get(parameter)!;
                                    setValueBySymbolDesc(item, "@parameters", parameters);
                                }
                            }
                        } else if (code == 102 && Array.isArray(parameter)) {
                            for (const [j, param] of (parameter as string[]).entries()) {
                                if (typeof param === "string") {
                                    if (textMap.has(param.replaceAll("\\n[", "\\N["))) {
                                        (parameters[i][j] as string) = textMap.get(param.replaceAll("\\n[", "\\N["))!;

                                        setValueBySymbolDesc(item, "@parameters", parameters);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if (logging) {
                console.log(`${logString} ${f}`);
            }
        }

        writeFileSync(`${outputDir}/${f}`, dump(file));
    }
}

export function writeOther(
    json: any,
    outputDir: string,
    otherDir: string,
    logging: boolean,
    logString: string,
    drunk: number
): void {
    for (const [f, file] of json) {
        const otherOriginalText: string[] = readFileSync(`${otherDir}/${f.slice(0, f.lastIndexOf("."))}.txt`, "utf8")
            .split("\n")
            .map((l: string) => l.replaceAll("\\n", "\n"));

        let otherTranslatedText: string[] = readFileSync(
            `${otherDir}/${f.slice(0, f.lastIndexOf("."))}_trans.txt`,
            "utf8"
        )
            .split("\n")
            .map((l: string) => l.replaceAll("\\n", "\n"));

        if (drunk > 0) {
            otherTranslatedText = otherTranslatedText.shuffle();

            if (drunk === 2) {
                otherTranslatedText = otherTranslatedText.map((string) => {
                    let words = string.split(new RegExp(" "));
                    words = words.shuffle();
                    return words.join(" ");
                });
            }
        }

        const map = new Map(otherOriginalText.map((string, i) => [string, otherTranslatedText[i]]));

        if (f !== "Commonevents.rvdata2" && f != "Troops.rvdata2") {
            for (const element of file) {
                const name: string = getValueBySymbolDesc(element, "@name");
                const description: string = getValueBySymbolDesc(element, "@description");
                const note: string = getValueBySymbolDesc(element, "@note");

                if (map.has(name)) {
                    setValueBySymbolDesc(element, "@name", map.get(name));
                }

                if (typeof description === "string" && map.has(description)) {
                    setValueBySymbolDesc(element, "@description", map.get(description));
                }

                if (f === "Classes.rvdata2" && map.has(note)) {
                    setValueBySymbolDesc(element, "@note", map.get(note));
                }
            }
        } else {
            for (const element of file.slice(1)) {
                const pages: object[] = getValueBySymbolDesc(element, "@pages");
                const pagesLength: number = f == "Troops.rvdata2" ? pages.length : 1;

                for (let i = 0; i < pagesLength; i++) {
                    const list =
                        f == "Troops.rvdata2"
                            ? getValueBySymbolDesc(pages[i], "@list")
                            : getValueBySymbolDesc(element, "@list");

                    if (!Array.isArray(list)) {
                        for (const item of list) {
                            const code: number = getValueBySymbolDesc(item, "@code");
                            const parameters: string[] = getValueBySymbolDesc(item, "@parameters");

                            for (const [i, parameter] of parameters.entries()) {
                                if (typeof parameter === "string") {
                                    if (
                                        [401, 402, 324].includes(code) ||
                                        (code === 356 &&
                                            (parameter.startsWith("GabText") ||
                                                (parameter.startsWith("choice_text") && !parameter.endsWith("????"))))
                                    ) {
                                        if (map.has(parameter)) {
                                            parameters[i] = map.get(parameter)!;

                                            setValueBySymbolDesc(item, "@parameters", parameters);
                                        }
                                    }
                                } else if (code === 102 && Array.isArray(parameter)) {
                                    for (const [j, param] of (parameter as string[]).entries()) {
                                        if (typeof param === "string") {
                                            if (map.has(param.replaceAll("\\n[", "\\N["))) {
                                                (parameters[i][j] as string) = map.get(
                                                    param.replaceAll("\\n[", "\\N[")
                                                )!;

                                                setValueBySymbolDesc(item, "@parameters", parameters);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (logging) {
            console.log(`${logString} ${f}`);
        }

        writeFileSync(`${outputDir}/${f}`, dump(file));
    }
}

export function writeSystem(
    json: any,
    outputDir: string,
    systemTextMap: Map<string, string>,
    logging: boolean,
    logString: string
): void {
    const symbols = ["@skill_types", "@weapon_types", "@armor_types", "@currency_unit", "@terms"];
    const [skillTypes, weaponTypes, armorTypes, currencyUnit, terms] = symbols.map((symbol) =>
        getValueBySymbolDesc(json, symbol)
    );

    for (const [i, arr] of [skillTypes, weaponTypes, armorTypes].entries()) {
        for (const [j, element] of arr.entries()) {
            if (element && systemTextMap.has(element)) {
                arr[j] = systemTextMap.get(element);

                setValueBySymbolDesc(json, symbols[i], arr);
            }
        }
    }

    setValueBySymbolDesc(json, currencyUnit, systemTextMap.get(currencyUnit));

    const termsSymbols = Object.getOwnPropertySymbols(terms);
    const termsValues = termsSymbols.map((symbol) => terms[symbol]);

    for (let i = 0; i < termsSymbols.length; i++) {
        for (const [j, termValue] of termsValues.entries()) {
            if (systemTextMap.has(termValue[j])) {
                termValue[j] = systemTextMap.get(termValue[j])!;
            }

            setValueBySymbolDesc(terms, termsSymbols[i].description as string, termValue);
        }
    }

    if (logging) {
        console.log(`${logString} System.rvdata2`);
    }
    writeFileSync(`${outputDir}/System.rvdata2`, dump(json));
}
