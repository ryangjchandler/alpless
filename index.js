const effects = new Map();

let currentEffect = null;

const reactive = (object) => {
    if (object === null || typeof object !== "object") {
        return object;
    }

    for (const property in object) {
        object[property] = reactive(object[property]);
    }

    return new Proxy(object, {
        get(target, property) {
            if (currentEffect === null) {
                return target[property];
            }

            if (!effects.has(target)) {
                effects.set(target, {});
            }

            const targetEffects = effects.get(target);

            if (!targetEffects[property]) {
                targetEffects[property] = [];
            }

            targetEffects[property].push(currentEffect);

            return target[property];
        },
        set(target, property, value) {
            target[property] = reactive(value);

            if (effects.has(target)) {
                const targetEffects = effects.get(target)[property] || [];

                targetEffects.forEach((effect) => {
                    effect();
                });
            }

            return true;
        },
    });
};

function effect(callback) {
    currentEffect = callback;

    callback();

    currentEffect = null;
}

document.addEventListener("DOMContentLoaded", () => {
    const elements = document.querySelectorAll("[a-data]");

    elements.forEach((el) => {
        const dataExpression = el.getAttribute("a-data");
        let data = evaluate(dataExpression);

        if (typeof data === "function") {
            data = data();
        }

        data = reactive(data);

        walk(el, data);
    });
});

function walk(el, data) {
    if (el.children.length > 0) {
        Array.from(el.children).forEach((child) => {
            walk(child, data);
        });
    }

    const attributes = Array.from(el.attributes).filter(
        (attr) => attr.name.startsWith("a-") && attr.name !== "a-data"
    ).map(
        (attr) => parseAttr(attr)
    );

    attributes.forEach((attr) => {
        switch (attr.name) {
            case "a-text":
                handleText(el, attr.expression, data);
                break
            case "a-on":
                handleOn(el, attr.value, attr.modifiers, attr.expression, data)
        }
    });
}

function handleOn(el, event, modifiers, expression, data) {
    el.addEventListener(event, ($event) => {
        if (modifiers.includes('prevent')) {
            $event.preventDefault()
        }

        if (modifiers.includes('stop')) {
            $event.stopPropagation()
        }

        evaluate(expression, data, {
            '$event': $event
        })
    })
}

function parseAttr(attr) {
    const [nameAndArgument, ...modifiers] = attr.name.split('.')
    const [name, value] = nameAndArgument.split(':')

    return {
        name: name,
        value: value,
        modifiers: modifiers,
        expression: attr.value,
    }
}

function handleText(el, expression, data) {
    effect(() => {
        el.innerText = evaluate(expression, data);
    });
}

function evaluate(expression, context = {}, extras = {}) {
    const fn = new Function(
        ["context", ...Object.keys(extras)],
        `with (context) { __result = ${expression}; return __result; }`
    );

    return fn(context, ...Object.values(extras));
}

function evaluateLater(expression, context) {
    return (callback) => {
        const result = evaluate(expression, context)

        callback(result)
    }
}
