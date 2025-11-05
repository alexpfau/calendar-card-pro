/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const e=globalThis,t=e.ShadowRoot&&(void 0===e.ShadyCSS||e.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,a=Symbol(),n=new WeakMap;class i{constructor(e,t,n){if(this._$cssResult$=!0,n!==a)throw new Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this._strings=t}get styleSheet(){let e=this._styleSheet;const a=this._strings;if(t&&void 0===e){const t=void 0!==a&&1===a.length;t&&(e=n.get(a)),void 0===e&&((this._styleSheet=e=new CSSStyleSheet).replaceSync(this.cssText),t&&n.set(a,e))}return e}toString(){return this.cssText}}const r=(e,...t)=>{const n=1===e.length?e[0]:t.reduce(((t,a,n)=>t+(e=>{if(!0===e._$cssResult$)return e.cssText;if("number"==typeof e)return e;throw new Error(`Value passed to 'css' function must be a 'css' function result: ${e}. Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.`)})(a)+e[n+1]),e[0]);return new i(n,e,a)},o=e=>{let t="";for(const a of e.cssRules)t+=a.cssText;return new i("string"==typeof(n=t)?n:String(n),void 0,a);var n},s=t?e=>e:e=>e instanceof CSSStyleSheet?o(e):e
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */,{is:l,defineProperty:d,getOwnPropertyDescriptor:_,getOwnPropertyNames:c,getOwnPropertySymbols:h,getPrototypeOf:u}=Object,m=globalThis;let g;const p=m.trustedTypes,f=p?p.emptyScript:"",y=m.reactiveElementPolyfillSupportDevMode;{const e=m.litIssuedWarnings??=new Set;g=(t,a)=>{a+=` See https://lit.dev/msg/${t} for more information.`,e.has(a)||(console.warn(a),e.add(a))},g("dev-mode","Lit is in dev mode. Not recommended for production!"),m.ShadyDOM?.inUse&&void 0===y&&g("polyfill-support-missing","Shadow DOM is being polyfilled via `ShadyDOM` but the `polyfill-support` module has not been loaded.")}const v=(e,t)=>e,w={toAttribute(e,t){switch(t){case Boolean:e=e?f:null;break;case Object:case Array:e=null==e?e:JSON.stringify(e)}return e},fromAttribute(e,t){let a=e;switch(t){case Boolean:a=null!==e;break;case Number:a=null===e?null:Number(e);break;case Object:case Array:try{a=JSON.parse(e)}catch(e){a=null}}return a}},k=(e,t)=>!l(e,t),b={attribute:!0,type:String,converter:w,reflect:!1,hasChanged:k};Symbol.metadata??=Symbol("metadata"),m.litPropertyMetadata??=new WeakMap;class M extends HTMLElement{static addInitializer(e){this.__prepare(),(this._initializers??=[]).push(e)}static get observedAttributes(){return this.finalize(),this.__attributeToPropertyMap&&[...this.__attributeToPropertyMap.keys()]}static createProperty(e,t=b){if(t.state&&(t.attribute=!1),this.__prepare(),this.elementProperties.set(e,t),!t.noAccessor){const a=Symbol.for(`${String(e)} (@property() cache)`),n=this.getPropertyDescriptor(e,a,t);void 0!==n&&d(this.prototype,e,n)}}static getPropertyDescriptor(e,t,a){const{get:n,set:i}=_(this.prototype,e)??{get(){return this[t]},set(e){this[t]=e}};if(null==n){if("value"in(_(this.prototype,e)??{}))throw new Error(`Field ${JSON.stringify(String(e))} on ${this.name} was declared as a reactive property but it's actually declared as a value on the prototype. Usually this is due to using @property or @state on a method.`);g("reactive-property-without-getter",`Field ${JSON.stringify(String(e))} on ${this.name} was declared as a reactive property but it does not have a getter. This will be an error in a future version of Lit.`)}return{get(){return n?.call(this)},set(t){const r=n?.call(this);i.call(this,t),this.requestUpdate(e,r,a)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??b}static __prepare(){if(this.hasOwnProperty(v("elementProperties")))return;const e=u(this);e.finalize(),void 0!==e._initializers&&(this._initializers=[...e._initializers]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(v("finalized")))return;if(this.finalized=!0,this.__prepare(),this.hasOwnProperty(v("properties"))){const e=this.properties,t=[...c(e),...h(e)];for(const a of t)this.createProperty(a,e[a])}const e=this[Symbol.metadata];if(null!==e){const t=litPropertyMetadata.get(e);if(void 0!==t)for(const[e,a]of t)this.elementProperties.set(e,a)}this.__attributeToPropertyMap=new Map;for(const[e,t]of this.elementProperties){const a=this.__attributeNameForProperty(e,t);void 0!==a&&this.__attributeToPropertyMap.set(a,e)}this.elementStyles=this.finalizeStyles(this.styles),this.hasOwnProperty("createProperty")&&g("no-override-create-property","Overriding ReactiveElement.createProperty() is deprecated. The override will not be called with standard decorators"),this.hasOwnProperty("getPropertyDescriptor")&&g("no-override-get-property-descriptor","Overriding ReactiveElement.getPropertyDescriptor() is deprecated. The override will not be called with standard decorators")}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const a=new Set(e.flat(1/0).reverse());for(const e of a)t.unshift(s(e))}else void 0!==e&&t.push(s(e));return t}static __attributeNameForProperty(e,t){const a=t.attribute;return!1===a?void 0:"string"==typeof a?a:"string"==typeof e?e.toLowerCase():void 0}constructor(){super(),this.__instanceProperties=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this.__reflectingProperty=null,this.__initialize()}__initialize(){this.__updatePromise=new Promise((e=>this.enableUpdating=e)),this._$changedProperties=new Map,this.__saveInstanceProperties(),this.requestUpdate(),this.constructor._initializers?.forEach((e=>e(this)))}addController(e){(this.__controllers??=new Set).add(e),void 0!==this.renderRoot&&this.isConnected&&e.hostConnected?.()}removeController(e){this.__controllers?.delete(e)}__saveInstanceProperties(){const e=new Map,t=this.constructor.elementProperties;for(const a of t.keys())this.hasOwnProperty(a)&&(e.set(a,this[a]),delete this[a]);e.size>0&&(this.__instanceProperties=e)}createRenderRoot(){const a=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((a,n)=>{if(t)a.adoptedStyleSheets=n.map((e=>e instanceof CSSStyleSheet?e:e.styleSheet));else for(const t of n){const n=document.createElement("style"),i=e.litNonce;void 0!==i&&n.setAttribute("nonce",i),n.textContent=t.cssText,a.appendChild(n)}})(a,this.constructor.elementStyles),a}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this.__controllers?.forEach((e=>e.hostConnected?.()))}enableUpdating(e){}disconnectedCallback(){this.__controllers?.forEach((e=>e.hostDisconnected?.()))}attributeChangedCallback(e,t,a){this._$attributeToProperty(e,a)}__propertyToAttribute(e,t){const a=this.constructor.elementProperties.get(e),n=this.constructor.__attributeNameForProperty(e,a);if(void 0!==n&&!0===a.reflect){const i=(void 0!==a.converter?.toAttribute?a.converter:w).toAttribute(t,a.type);this.constructor.enabledWarnings.includes("migration")&&void 0===i&&g("undefined-attribute-value",`The attribute value for the ${e} property is undefined on element ${this.localName}. The attribute will be removed, but in the previous version of \`ReactiveElement\`, the attribute would not have changed.`),this.__reflectingProperty=e,null==i?this.removeAttribute(n):this.setAttribute(n,i),this.__reflectingProperty=null}}_$attributeToProperty(e,t){const a=this.constructor,n=a.__attributeToPropertyMap.get(e);if(void 0!==n&&this.__reflectingProperty!==n){const e=a.getPropertyOptions(n),i="function"==typeof e.converter?{fromAttribute:e.converter}:void 0!==e.converter?.fromAttribute?e.converter:w;this.__reflectingProperty=n,this[n]=i.fromAttribute(t,e.type),this.__reflectingProperty=null}}requestUpdate(e,t,a){if(void 0!==e){e instanceof Event&&g("","The requestUpdate() method was called with an Event as the property name. This is probably a mistake caused by binding this.requestUpdate as an event listener. Instead bind a function that will call it with no arguments: () => this.requestUpdate()"),a??=this.constructor.getPropertyOptions(e);if(!(a.hasChanged??k)(this[e],t))return;this._$changeProperty(e,t,a)}!1===this.isUpdatePending&&(this.__updatePromise=this.__enqueueUpdate())}_$changeProperty(e,t,a){this._$changedProperties.has(e)||this._$changedProperties.set(e,t),!0===a.reflect&&this.__reflectingProperty!==e&&(this.__reflectingProperties??=new Set).add(e)}async __enqueueUpdate(){this.isUpdatePending=!0;try{await this.__updatePromise}catch(e){Promise.reject(e)}const e=this.scheduleUpdate();return null!=e&&await e,!this.isUpdatePending}scheduleUpdate(){const e=this.performUpdate();return this.constructor.enabledWarnings.includes("async-perform-update")&&"function"==typeof e?.then&&g("async-perform-update",`Element ${this.localName} returned a Promise from performUpdate(). This behavior is deprecated and will be removed in a future version of ReactiveElement.`),e}performUpdate(){if(!this.isUpdatePending)return;var e;if(e={kind:"update"},m.emitLitDebugLogEvents&&m.dispatchEvent(new CustomEvent("lit-debug",{detail:e})),!this.hasUpdated){this.renderRoot??=this.createRenderRoot();{const e=[...this.constructor.elementProperties.keys()].filter((e=>this.hasOwnProperty(e)&&e in u(this)));if(e.length)throw new Error(`The following properties on element ${this.localName} will not trigger updates as expected because they are set using class fields: ${e.join(", ")}. Native class fields and some compiled output will overwrite accessors used for detecting changes. See https://lit.dev/msg/class-field-shadowing for more information.`)}if(this.__instanceProperties){for(const[e,t]of this.__instanceProperties)this[e]=t;this.__instanceProperties=void 0}const e=this.constructor.elementProperties;if(e.size>0)for(const[t,a]of e)!0!==a.wrapped||this._$changedProperties.has(t)||void 0===this[t]||this._$changeProperty(t,this[t],a)}let t=!1;const a=this._$changedProperties;try{t=this.shouldUpdate(a),t?(this.willUpdate(a),this.__controllers?.forEach((e=>e.hostUpdate?.())),this.update(a)):this.__markUpdated()}catch(e){throw t=!1,this.__markUpdated(),e}t&&this._$didUpdate(a)}willUpdate(e){}_$didUpdate(e){this.__controllers?.forEach((e=>e.hostUpdated?.())),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e),this.isUpdatePending&&this.constructor.enabledWarnings.includes("change-in-update")&&g("change-in-update",`Element ${this.localName} scheduled an update (generally because a property was set) after an update completed, causing a new update to be scheduled. This is inefficient and should be avoided unless the next update can only be scheduled as a side effect of the previous update.`)}__markUpdated(){this._$changedProperties=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this.__updatePromise}shouldUpdate(e){return!0}update(e){this.__reflectingProperties&&=this.__reflectingProperties.forEach((e=>this.__propertyToAttribute(e,this[e]))),this.__markUpdated()}updated(e){}firstUpdated(e){}}M.elementStyles=[],M.shadowRootOptions={mode:"open"},M[v("elementProperties")]=new Map,M[v("finalized")]=new Map,y?.({ReactiveElement:M});{M.enabledWarnings=["change-in-update","async-perform-update"];const e=function(e){e.hasOwnProperty(v("enabledWarnings"))||(e.enabledWarnings=e.enabledWarnings.slice())};M.enableWarning=function(t){e(this),this.enabledWarnings.includes(t)||this.enabledWarnings.push(t)},M.disableWarning=function(t){e(this);const a=this.enabledWarnings.indexOf(t);a>=0&&this.enabledWarnings.splice(a,1)}}(m.reactiveElementVersions??=[]).push("2.0.4"),m.reactiveElementVersions.length>1&&g("multiple-versions","Multiple versions of Lit loaded. Loading multiple versions is not recommended.");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const T=globalThis,$=e=>{T.emitLitDebugLogEvents&&T.dispatchEvent(new CustomEvent("lit-debug",{detail:e}))};let D,S=0;T.litIssuedWarnings??=new Set,D=(e,t)=>{t+=e?` See https://lit.dev/msg/${e} for more information.`:"",T.litIssuedWarnings.has(t)||(console.warn(t),T.litIssuedWarnings.add(t))},D("dev-mode","Lit is in dev mode. Not recommended for production!");const x=T.ShadyDOM?.inUse&&!0===T.ShadyDOM?.noPatch?T.ShadyDOM.wrap:e=>e,Y=T.trustedTypes,z=Y?Y.createPolicy("lit-html",{createHTML:e=>e}):void 0,L=e=>e,j=(e,t,a)=>L,E=e=>{if(ie!==j)throw new Error("Attempted to overwrite existing lit-html security policy. setSanitizeDOMValueFactory should be called at most once.");ie=e},C=()=>{ie=j},H=(e,t,a)=>ie(e,t,a),F="$lit$",V=`lit$${Math.random().toFixed(9).slice(2)}$`,O="?"+V,A=`<${O}>`,P=document,I=()=>P.createComment(""),N=e=>null===e||"object"!=typeof e&&"function"!=typeof e,W=Array.isArray,U="[ \t\n\f\r]",B=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,R=/-->/g,K=/>/g,J=new RegExp(`>|${U}(?:([^\\s"'>=/]+)(${U}*=${U}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),Z=/'/g,q=/"/g,G=/^(?:script|style|textarea|title)$/i,Q=(X=1,(e,...t)=>(e.some((e=>void 0===e))&&console.warn("Some template strings are undefined.\nThis is probably caused by illegal octal escape sequences."),t.some((e=>e?._$litStatic$))&&D("","Static values 'literal' or 'unsafeStatic' cannot be used as values to non-static templates.\nPlease use the static 'html' tag function. See https://lit.dev/docs/templates/expressions/#static-expressions"),{_$litType$:X,strings:e,values:t}));var X;const ee=Symbol.for("lit-noChange"),te=Symbol.for("lit-nothing"),ae=new WeakMap,ne=P.createTreeWalker(P,129);let ie=j;function re(e,t){if(!W(e)||!e.hasOwnProperty("raw")){let e="invalid template strings array";throw e="\n          Internal Error: expected template strings to be an array\n          with a 'raw' field. Faking a template strings array by\n          calling html or svg like an ordinary function is effectively\n          the same as calling unsafeHtml and can lead to major security\n          issues, e.g. opening your code up to XSS attacks.\n          If you're using the html or svg tagged template functions normally\n          and still seeing this error, please file a bug at\n          https://github.com/lit/lit/issues/new?template=bug_report.md\n          and include information about your build tooling, if any.\n        ".trim().replace(/\n */g,"\n"),new Error(e)}return void 0!==z?z.createHTML(t):t}class oe{constructor({strings:e,_$litType$:t},a){let n;this.parts=[];let i=0,r=0;const o=e.length-1,s=this.parts,[l,d]=((e,t)=>{const a=e.length-1,n=[];let i,r=2===t?"<svg>":3===t?"<math>":"",o=B;for(let t=0;t<a;t++){const a=e[t];let s,l,d=-1,_=0;for(;_<a.length&&(o.lastIndex=_,l=o.exec(a),null!==l);)if(_=o.lastIndex,o===B){if("!--"===l[1])o=R;else if(void 0!==l[1])o=K;else if(void 0!==l[2])G.test(l[2])&&(i=new RegExp(`</${l[2]}`,"g")),o=J;else if(void 0!==l[3])throw new Error("Bindings in tag names are not supported. Please use static templates instead. See https://lit.dev/docs/templates/expressions/#static-expressions")}else o===J?">"===l[0]?(o=i??B,d=-1):void 0===l[1]?d=-2:(d=o.lastIndex-l[2].length,s=l[1],o=void 0===l[3]?J:'"'===l[3]?q:Z):o===q||o===Z?o=J:o===R||o===K?o=B:(o=J,i=void 0);console.assert(-1===d||o===J||o===Z||o===q,"unexpected parse state B");const c=o===J&&e[t+1].startsWith("/>")?" ":"";r+=o===B?a+A:d>=0?(n.push(s),a.slice(0,d)+F+a.slice(d)+V+c):a+V+(-2===d?t:c)}return[re(e,r+(e[a]||"<?>")+(2===t?"</svg>":3===t?"</math>":"")),n]})(e,t);if(this.el=oe.createElement(l,a),ne.currentNode=this.el.content,2===t||3===t){const e=this.el.content.firstChild;e.replaceWith(...e.childNodes)}for(;null!==(n=ne.nextNode())&&s.length<o;){if(1===n.nodeType){{const e=n.localName;if(/^(?:textarea|template)$/i.test(e)&&n.innerHTML.includes(V)){const t=`Expressions are not supported inside \`${e}\` elements. See https://lit.dev/msg/expression-in-${e} for more information.`;if("template"===e)throw new Error(t);D("",t)}}if(n.hasAttributes())for(const e of n.getAttributeNames())if(e.endsWith(F)){const t=d[r++],a=n.getAttribute(e).split(V),o=/([.?@])?(.*)/.exec(t);s.push({type:1,index:i,name:o[2],strings:a,ctor:"."===o[1]?ce:"?"===o[1]?he:"@"===o[1]?ue:_e}),n.removeAttribute(e)}else e.startsWith(V)&&(s.push({type:6,index:i}),n.removeAttribute(e));if(G.test(n.tagName)){const e=n.textContent.split(V),t=e.length-1;if(t>0){n.textContent=Y?Y.emptyScript:"";for(let a=0;a<t;a++)n.append(e[a],I()),ne.nextNode(),s.push({type:2,index:++i});n.append(e[t],I())}}}else if(8===n.nodeType){if(n.data===O)s.push({type:2,index:i});else{let e=-1;for(;-1!==(e=n.data.indexOf(V,e+1));)s.push({type:7,index:i}),e+=V.length-1}}i++}if(d.length!==r)throw new Error('Detected duplicate attribute bindings. This occurs if your template has duplicate attributes on an element tag. For example "<input ?disabled=${true} ?disabled=${false}>" contains a duplicate "disabled" attribute. The error was detected in the following template: \n`'+e.join("${...}")+"`");$&&$({kind:"template prep",template:this,clonableTemplate:this.el,parts:this.parts,strings:e})}static createElement(e,t){const a=P.createElement("template");return a.innerHTML=e,a}}function se(e,t,a=e,n){if(t===ee)return t;let i=void 0!==n?a.__directives?.[n]:a.__directive;const r=N(t)?void 0:t._$litDirective$;return i?.constructor!==r&&(i?._$notifyDirectiveConnectionChanged?.(!1),void 0===r?i=void 0:(i=new r(e),i._$initialize(e,a,n)),void 0!==n?(a.__directives??=[])[n]=i:a.__directive=i),void 0!==i&&(t=se(e,i._$resolve(e,t.values),i,n)),t}class le{constructor(e,t){this._$parts=[],this._$disconnectableChildren=void 0,this._$template=e,this._$parent=t}get parentNode(){return this._$parent.parentNode}get _$isConnected(){return this._$parent._$isConnected}_clone(e){const{el:{content:t},parts:a}=this._$template,n=(e?.creationScope??P).importNode(t,!0);ne.currentNode=n;let i=ne.nextNode(),r=0,o=0,s=a[0];for(;void 0!==s;){if(r===s.index){let t;2===s.type?t=new de(i,i.nextSibling,this,e):1===s.type?t=new s.ctor(i,s.name,s.strings,this,e):6===s.type&&(t=new me(i,this,e)),this._$parts.push(t),s=a[++o]}r!==s?.index&&(i=ne.nextNode(),r++)}return ne.currentNode=P,n}_update(e){let t=0;for(const a of this._$parts)void 0!==a&&($&&$({kind:"set part",part:a,value:e[t],valueIndex:t,values:e,templateInstance:this}),void 0!==a.strings?(a._$setValue(e,a,t),t+=a.strings.length-2):a._$setValue(e[t])),t++}}let de=class e{get _$isConnected(){return this._$parent?._$isConnected??this.__isConnected}constructor(e,t,a,n){this.type=2,this._$committedValue=te,this._$disconnectableChildren=void 0,this._$startNode=e,this._$endNode=t,this._$parent=a,this.options=n,this.__isConnected=n?.isConnected??!0,this._textSanitizer=void 0}get parentNode(){let e=x(this._$startNode).parentNode;const t=this._$parent;return void 0!==t&&11===e?.nodeType&&(e=t.parentNode),e}get startNode(){return this._$startNode}get endNode(){return this._$endNode}_$setValue(e,t=this){if(null===this.parentNode)throw new Error("This `ChildPart` has no `parentNode` and therefore cannot accept a value. This likely means the element containing the part was manipulated in an unsupported way outside of Lit's control such that the part's marker nodes were ejected from DOM. For example, setting the element's `innerHTML` or `textContent` can do this.");if(e=se(this,e,t),N(e))e===te||null==e||""===e?(this._$committedValue!==te&&($&&$({kind:"commit nothing to child",start:this._$startNode,end:this._$endNode,parent:this._$parent,options:this.options}),this._$clear()),this._$committedValue=te):e!==this._$committedValue&&e!==ee&&this._commitText(e);else if(void 0!==e._$litType$)this._commitTemplateResult(e);else if(void 0!==e.nodeType){if(this.options?.host===e)return this._commitText("[probable mistake: rendered a template's host in itself (commonly caused by writing ${this} in a template]"),void console.warn("Attempted to render the template host",e,"inside itself. This is almost always a mistake, and in dev mode ","we render some warning text. In production however, we'll ","render it, which will usually result in an error, and sometimes ","in the element disappearing from the DOM.");this._commitNode(e)}else(e=>W(e)||"function"==typeof e?.[Symbol.iterator])(e)?this._commitIterable(e):this._commitText(e)}_insert(e){return x(x(this._$startNode).parentNode).insertBefore(e,this._$endNode)}_commitNode(e){if(this._$committedValue!==e){if(this._$clear(),ie!==j){const e=this._$startNode.parentNode?.nodeName;if("STYLE"===e||"SCRIPT"===e){let t="Forbidden";throw t="STYLE"===e?"Lit does not support binding inside style nodes. This is a security risk, as style injection attacks can exfiltrate data and spoof UIs. Consider instead using css`...` literals to compose styles, and do dynamic styling with css custom properties, ::parts, <slot>s, and by mutating the DOM rather than stylesheets.":"Lit does not support binding inside script nodes. This is a security risk, as it could allow arbitrary code execution.",new Error(t)}}$&&$({kind:"commit node",start:this._$startNode,parent:this._$parent,value:e,options:this.options}),this._$committedValue=this._insert(e)}}_commitText(e){if(this._$committedValue!==te&&N(this._$committedValue)){const t=x(this._$startNode).nextSibling;void 0===this._textSanitizer&&(this._textSanitizer=H(t,"data","property")),e=this._textSanitizer(e),$&&$({kind:"commit text",node:t,value:e,options:this.options}),t.data=e}else{const t=P.createTextNode("");this._commitNode(t),void 0===this._textSanitizer&&(this._textSanitizer=H(t,"data","property")),e=this._textSanitizer(e),$&&$({kind:"commit text",node:t,value:e,options:this.options}),t.data=e}this._$committedValue=e}_commitTemplateResult(e){const{values:t,_$litType$:a}=e,n="number"==typeof a?this._$getTemplate(e):(void 0===a.el&&(a.el=oe.createElement(re(a.h,a.h[0]),this.options)),a);if(this._$committedValue?._$template===n)$&&$({kind:"template updating",template:n,instance:this._$committedValue,parts:this._$committedValue._$parts,options:this.options,values:t}),this._$committedValue._update(t);else{const e=new le(n,this),a=e._clone(this.options);$&&$({kind:"template instantiated",template:n,instance:e,parts:e._$parts,options:this.options,fragment:a,values:t}),e._update(t),$&&$({kind:"template instantiated and updated",template:n,instance:e,parts:e._$parts,options:this.options,fragment:a,values:t}),this._commitNode(a),this._$committedValue=e}}_$getTemplate(e){let t=ae.get(e.strings);return void 0===t&&ae.set(e.strings,t=new oe(e)),t}_commitIterable(t){W(this._$committedValue)||(this._$committedValue=[],this._$clear());const a=this._$committedValue;let n,i=0;for(const r of t)i===a.length?a.push(n=new e(this._insert(I()),this._insert(I()),this,this.options)):n=a[i],n._$setValue(r),i++;i<a.length&&(this._$clear(n&&x(n._$endNode).nextSibling,i),a.length=i)}_$clear(e=x(this._$startNode).nextSibling,t){for(this._$notifyConnectionChanged?.(!1,!0,t);e&&e!==this._$endNode;){const t=x(e).nextSibling;x(e).remove(),e=t}}setConnected(e){if(void 0!==this._$parent)throw new Error("part.setConnected() may only be called on a RootPart returned from render().");this.__isConnected=e,this._$notifyConnectionChanged?.(e)}};class _e{get tagName(){return this.element.tagName}get _$isConnected(){return this._$parent._$isConnected}constructor(e,t,a,n,i){this.type=1,this._$committedValue=te,this._$disconnectableChildren=void 0,this.element=e,this.name=t,this._$parent=n,this.options=i,a.length>2||""!==a[0]||""!==a[1]?(this._$committedValue=new Array(a.length-1).fill(new String),this.strings=a):this._$committedValue=te,this._sanitizer=void 0}_$setValue(e,t=this,a,n){const i=this.strings;let r=!1;if(void 0===i)e=se(this,e,t,0),r=!N(e)||e!==this._$committedValue&&e!==ee,r&&(this._$committedValue=e);else{const n=e;let o,s;for(e=i[0],o=0;o<i.length-1;o++)s=se(this,n[a+o],t,o),s===ee&&(s=this._$committedValue[o]),r||=!N(s)||s!==this._$committedValue[o],s===te?e=te:e!==te&&(e+=(s??"")+i[o+1]),this._$committedValue[o]=s}r&&!n&&this._commitValue(e)}_commitValue(e){e===te?x(this.element).removeAttribute(this.name):(void 0===this._sanitizer&&(this._sanitizer=ie(this.element,this.name,"attribute")),e=this._sanitizer(e??""),$&&$({kind:"commit attribute",element:this.element,name:this.name,value:e,options:this.options}),x(this.element).setAttribute(this.name,e??""))}}class ce extends _e{constructor(){super(...arguments),this.type=3}_commitValue(e){void 0===this._sanitizer&&(this._sanitizer=ie(this.element,this.name,"property")),e=this._sanitizer(e),$&&$({kind:"commit property",element:this.element,name:this.name,value:e,options:this.options}),this.element[this.name]=e===te?void 0:e}}class he extends _e{constructor(){super(...arguments),this.type=4}_commitValue(e){$&&$({kind:"commit boolean attribute",element:this.element,name:this.name,value:!(!e||e===te),options:this.options}),x(this.element).toggleAttribute(this.name,!!e&&e!==te)}}class ue extends _e{constructor(e,t,a,n,i){if(super(e,t,a,n,i),this.type=5,void 0!==this.strings)throw new Error(`A \`<${e.localName}>\` has a \`@${t}=...\` listener with invalid content. Event listeners in templates must have exactly one expression and no surrounding text.`)}_$setValue(e,t=this){if((e=se(this,e,t,0)??te)===ee)return;const a=this._$committedValue,n=e===te&&a!==te||e.capture!==a.capture||e.once!==a.once||e.passive!==a.passive,i=e!==te&&(a===te||n);$&&$({kind:"commit event listener",element:this.element,name:this.name,value:e,options:this.options,removeListener:n,addListener:i,oldListener:a}),n&&this.element.removeEventListener(this.name,this,a),i&&this.element.addEventListener(this.name,this,e),this._$committedValue=e}handleEvent(e){"function"==typeof this._$committedValue?this._$committedValue.call(this.options?.host??this.element,e):this._$committedValue.handleEvent(e)}}class me{constructor(e,t,a){this.element=e,this.type=6,this._$disconnectableChildren=void 0,this._$parent=t,this.options=a}get _$isConnected(){return this._$parent._$isConnected}_$setValue(e){$&&$({kind:"commit to element binding",element:this.element,value:e,options:this.options}),se(this,e)}}const ge={_ChildPart:de},pe=T.litHtmlPolyfillSupportDevMode;pe?.(oe,de),(T.litHtmlVersions??=[]).push("3.2.1"),T.litHtmlVersions.length>1&&D("multiple-versions","Multiple versions of Lit loaded. Loading multiple versions is not recommended.");const fe=(e,t,a)=>{if(null==t)throw new TypeError(`The container to render into may not be ${t}`);const n=S++,i=a?.renderBefore??t;let r=i._$litPart$;if($&&$({kind:"begin render",id:n,value:e,container:t,options:a,part:r}),void 0===r){const e=a?.renderBefore??null;i._$litPart$=r=new de(t.insertBefore(I(),e),e,void 0,a??{})}return r._$setValue(e),$&&$({kind:"end render",id:n,value:e,container:t,options:a,part:r}),r};fe.setSanitizer=E,fe.createSanitizer=H,fe._testOnlyClearSanitizerFactoryDoNotCallOrElse=C;let ye;{const e=globalThis.litIssuedWarnings??=new Set;ye=(t,a)=>{a+=` See https://lit.dev/msg/${t} for more information.`,e.has(a)||(console.warn(a),e.add(a))}}class ve extends M{constructor(){super(...arguments),this.renderOptions={host:this},this.__childPart=void 0}createRenderRoot(){const e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this.__childPart=fe(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this.__childPart?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this.__childPart?.setConnected(!1)}render(){return ee}}var we;ve._$litElement$=!0,ve[(we="finalized",we)]=!0,globalThis.litElementHydrateSupport?.({LitElement:ve});const ke=globalThis.litElementPolyfillSupportDevMode;ke?.({LitElement:ve}),(globalThis.litElementVersions??=[]).push("4.1.1"),globalThis.litElementVersions.length>1&&ye("multiple-versions","Multiple versions of Lit loaded. Loading multiple versions is not recommended.")
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
let be;{const e=globalThis.litIssuedWarnings??=new Set;be=(t,a)=>{a+=` See https://lit.dev/msg/${t} for more information.`,e.has(a)||(console.warn(a),e.add(a))}}const Me={attribute:!0,type:String,converter:w,reflect:!1,hasChanged:k},Te=(e=Me,t,a)=>{const{kind:n,metadata:i}=a;null==i&&be("missing-class-metadata",`The class ${t} is missing decorator metadata. This could mean that you're using a compiler that supports decorators but doesn't support decorator metadata, such as TypeScript 5.1. Please update your compiler.`);let r=globalThis.litPropertyMetadata.get(i);if(void 0===r&&globalThis.litPropertyMetadata.set(i,r=new Map),r.set(a.name,e),"accessor"===n){const{name:n}=a;return{set(a){const i=t.get.call(this);t.set.call(this,a),this.requestUpdate(n,i,e)},init(t){return void 0!==t&&this._$changeProperty(n,void 0,e),t}}}if("setter"===n){const{name:n}=a;return function(a){const i=this[n];t.call(this,a),this.requestUpdate(n,i,e)}}throw new Error(`Unsupported decorator location: ${n}`)};function $e(e){return(t,a)=>"object"==typeof a?Te(e,t,a):((e,t,a)=>{const n=t.hasOwnProperty(a);return t.constructor.createProperty(a,n?{...e,wrapped:!0}:e),n?Object.getOwnPropertyDescriptor(t,a):void 0})(e,t,a)}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */globalThis.litIssuedWarnings??=new Set;const De="3.1.0",Se=30,xe=5,Ye="cache_data_",ze=0,Le="📅 Calendar Card Pro",je=500,Ee=200,Ce=300,He=3e5,Fe={WEEK:1,MONTH:1.5},Ve=.2,Oe={TOUCH_SIZE:100,POINTER_SIZE:50},Ae=["Germany","Deutschland","United States","USA","United States of America","United Kingdom","Great Britain","France","Italy","Italia","Spain","España","Netherlands","Nederland","Austria","Österreich","Switzerland","Schweiz"];var Pe=Object.defineProperty,Ie=Object.defineProperties,Ne=Object.getOwnPropertyDescriptors,We=Object.getOwnPropertySymbols,Ue=Object.prototype.hasOwnProperty,Be=Object.prototype.propertyIsEnumerable,Re=(e,t,a)=>t in e?Pe(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a,Ke=(e,t)=>{for(var a in t||(t={}))Ue.call(t,a)&&Re(e,a,t[a]);if(We)for(var a of We(t))Be.call(t,a)&&Re(e,a,t[a]);return e},Je=(e,t)=>Ie(e,Ne(t));let Ze=!1,qe=ze;const Ge={title:["background: #424242","color: white","display: inline-block","line-height: 20px","text-align: center","border-radius: 20px 0 0 20px","font-size: 12px","font-weight: bold","padding: 4px 8px 4px 12px","margin: 5px 0"].join(";"),version:["background: #4fc3f7","color: white","display: inline-block","line-height: 20px","text-align: center","border-radius: 0 20px 20px 0","font-size: 12px","font-weight: bold","padding: 4px 12px 4px 8px","margin: 5px 0"].join(";"),prefix:["color: #4fc3f7","font-weight: bold"].join(";"),error:["color: #f44336","font-weight: bold"].join(";"),warn:["color: #ff9800","font-weight: bold"].join(";")};function Qe(e){!function(e){if(Ze)return;console.groupCollapsed(`%c${Le}%cv${e} `,Ge.title,Ge.version),console.log("%c Description: %c A calendar card that supports multiple calendars with individual styling. ","font-weight: bold","font-weight: normal"),console.log("%c GitHub: %c https://github.com/alexpfau/calendar-card-pro ","font-weight: bold","font-weight: normal"),console.groupEnd(),Ze=!0}(e)}function Xe(e,t,...a){const n=function(e){if(null==e)return;if("string"==typeof e)return e;if("object"==typeof e)try{return Ke({},e)}catch(t){try{return{value:JSON.stringify(e)}}catch(t){return{value:String(e)}}}return String(e)}(t);if(e instanceof Error){const t=e.message||"Unknown error",i="string"==typeof n?` during ${n}`:"",[r,o]=it(`Error${i}: ${t}`,Ge.error);console.error(r,o),e.stack&&console.error(e.stack),n&&"object"==typeof n&&console.error("Context:",Je(Ke({},n),{timestamp:(new Date).toISOString()})),a.length>0&&console.error("Additional data:",...a)}else if("string"==typeof e){const t="string"==typeof n?` during ${n}`:"",[i,r]=it(`${e}${t}`,Ge.error);n&&"object"==typeof n?console.error(i,r,Ke({context:Je(Ke({},n),{timestamp:(new Date).toISOString()})},a.length>0?{additionalData:a}:{})):a.length>0?console.error(i,r,...a):console.error(i,r)}else{const t="string"==typeof n?` during ${n}`:"",[i,r]=it(`Unknown error${t}:`,Ge.error);console.error(i,r,e),n&&"object"==typeof n&&console.error("Context:",Je(Ke({},n),{timestamp:(new Date).toISOString()})),a.length>0&&console.error("Additional data:",...a)}}function et(e,...t){nt(1,e,Ge.warn,console.warn,...t)}function tt(e,...t){nt(2,e,Ge.prefix,console.log,...t)}function at(e,...t){nt(3,e,Ge.prefix,console.log,...t)}function nt(e,t,a,n,...i){if(qe<e)return;const[r,o]=it(t,a);i.length>0?n(r,o,...i):n(r,o)}function it(e,t){return[`%c[${Le}] ${e}`,t]}const rt={entities:[],start_date:void 0,days_to_show:3,compact_days_to_show:void 0,compact_events_to_show:void 0,compact_events_complete_days:!1,show_empty_days:!1,filter_duplicates:!1,split_multiday_events:!1,language:void 0,title:void 0,title_font_size:void 0,title_color:void 0,background_color:"var(--ha-card-background)",accent_color:"#03a9f4",vertical_line_width:"2px",day_spacing:"10px",event_spacing:"4px",additional_card_spacing:"0px",height:"auto",max_height:"none",first_day_of_week:"system",show_week_numbers:null,show_current_week_number:!0,week_number_font_size:"12px",week_number_color:"var(--primary-text-color)",week_number_background_color:"#03a9f450",day_separator_width:"0px",day_separator_color:"var(--secondary-text-color)",week_separator_width:"0px",week_separator_color:"#03a9f450",month_separator_width:"0px",month_separator_color:"var(--primary-text-color)",today_indicator:!1,today_indicator_position:"15% 50%",today_indicator_color:"#03a9f4",today_indicator_size:"6px",date_vertical_alignment:"middle",weekday_font_size:"14px",weekday_color:"var(--primary-text-color)",day_font_size:"26px",day_color:"var(--primary-text-color)",show_month:!0,month_font_size:"12px",month_color:"var(--primary-text-color)",weekend_weekday_color:void 0,weekend_day_color:void 0,weekend_month_color:void 0,today_weekday_color:void 0,today_day_color:void 0,today_month_color:void 0,event_background_opacity:0,show_past_events:!1,show_countdown:!1,show_progress_bar:!1,progress_bar_color:"var(--secondary-text-color)",progress_bar_height:"calc(var(--calendar-card-font-size-time) * 0.75)",progress_bar_width:"60px",event_font_size:"14px",event_color:"var(--primary-text-color)",empty_day_color:"var(--primary-text-color)",show_time:!0,show_single_allday_time:!0,time_24h:"system",show_end_time:!0,time_font_size:"12px",time_color:"var(--secondary-text-color)",time_icon_size:"14px",show_location:!0,remove_location_country:!1,location_font_size:"12px",location_color:"var(--secondary-text-color)",location_icon_size:"14px",weather:{entity:void 0,position:"date",date:{show_conditions:!0,show_high_temp:!0,show_low_temp:!1,icon_size:"14px",font_size:"12px",color:"var(--primary-text-color)"},event:{show_conditions:!0,show_temp:!0,icon_size:"14px",font_size:"12px",color:"var(--primary-text-color)"}},tap_action:{action:"none"},hold_action:{action:"none"},refresh_interval:Se,refresh_on_navigate:!0};function ot(e){const t=function(e){if(!e||"object"!=typeof e)return null;if("states"in e&&"object"==typeof e.states){const t=Object.keys(e.states).find((e=>e.startsWith("calendar.")));if(t)return t}return Object.keys(e).find((e=>e.startsWith("calendar.")))||null}(e);return{type:"custom:calendar-card-pro",entities:t?[t]:[],days_to_show:3,show_location:!0,_description:t?void 0:"A calendar card that displays events from multiple calendars with individual styling. Add a calendar integration to Home Assistant to use this card."}}var st={daysOfWeek:["нед.","пон.","вт.","ср.","четв.","пет.","съб."],fullDaysOfWeek:["неделя","понеделник","вторник","сряда","четвъртък","петък","събота"],months:["ян.","фев.","мар","апр.","май","юни","юли","авг.","септ.","окт.","ноем.","дек."],allDay:"цял ден",multiDay:"до",at:"в",endsToday:"приключва днес",endsTomorrow:"приключва утре",noEvents:"Няма планирани събития",loading:"Зареждане на календара със събития...",error:"Грешка: календарът не е намерен или не е конфигуриран правилно"},lt={daysOfWeek:["Ne","Po","Út","St","Čt","Pá","So"],fullDaysOfWeek:["Neděle","Pondělí","Úterý","Středa","Čtvrtek","Pátek","Sobota"],months:["Led","Úno","Bře","Dub","Kvě","Čvn","Čvc","Srp","Zář","Říj","Lis","Pro"],allDay:"celý den",multiDay:"do",at:"v",endsToday:"končí dnes",endsTomorrow:"končí zítra",noEvents:"Žádné nadcházející události",loading:"Načítání událostí z kalendáře...",error:"Chyba: Entita kalendáře nebyla nalezena nebo je nesprávně nakonfigurována"},dt={daysOfWeek:["Dg","Dl","Dm","Dc","Dj","Dv","Ds"],fullDaysOfWeek:["Diumenge","Dilluns","Dimarts","Dimecres","Dijous","Divendres","Dissabte"],months:["Gen","Febr","Març","Abr","Maig","Juny","Jul","Ag","Set","Oct","Nov","Des"],allDay:"tot el dia",multiDay:"fins a",at:"a les",endsToday:"acaba avui",endsTomorrow:"acaba damà",noEvents:"Cap event proper",loading:"Carregant events...",error:"Error: No s'ha trobat l'entitat del calendari o aquesta està mal configurada"},_t={daysOfWeek:["Søn","Man","Tir","Ons","Tor","Fre","Lør"],fullDaysOfWeek:["Søndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag"],months:["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"],allDay:"hele dagen",multiDay:"indtil",at:"kl.",endsToday:"slutter i dag",endsTomorrow:"slutter i morgen",noEvents:"Ingen kommende begivenheder",loading:"Indlæser kalenderbegivenheder...",error:"Fejl: Kalenderenheden blev ikke fundet eller er ikke konfigureret korrekt"},ct={daysOfWeek:["So","Mo","Di","Mi","Do","Fr","Sa"],fullDaysOfWeek:["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"],months:["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"],allDay:"ganztägig",multiDay:"bis",at:"um",endsToday:"endet heute",endsTomorrow:"endet morgen",noEvents:"Keine anstehenden Termine",loading:"Kalendereinträge werden geladen...",error:"Fehler: Kalender-Entität nicht gefunden oder falsch konfiguriert",editor:{calendar_entities:"Kalender Entitäten",calendar:"Kalender",entity_identification:"Entitäts-Identifikation",entity:"Entität",add_calendar:"Kalender hinzufügen",remove:"Entfernen",convert_to_advanced:"In Erweitert umwandeln",simple:"Einfach",display_settings:"Ansichts-Einstellungen",label:"Label",label_type:"Label-Typ",none:"Keiner",text_emoji:"Text/Emoji",icon:"Symbol",text_value:"Textwert",text_label_note:"Text oder Emoji wie '📅 Mein Kalender' eingeben",image:"Bild",image_label_note:"Pfad zum Bild wie /local/calendar.jpg",label_note:"Benutzerdefiniertes Label für diesen Kalender.",colors:"Farben",event_color:"Ereignisfarbe",entity_color_note:"Benutzerdefinierte Farbe für Ereignistitel aus diesem Kalender.",accent_color:"Akzentfarbe",entity_accent_color_note:"Benutzerdefinierte Akzentfarbe für die vertikale Linie der Ereignisse in diesem Kalender. Diese Farbe wird auch als Hintergrundfarbe für Ereignisse verwendet, wenn 'event_background_opacity' >0 ist.",event_filtering:"Ereignisfilterung",blocklist:"Sperrliste",blocklist_note:"Durch Pipes getrennte Liste von Begriffen zum Ausschließen von Ereignissen. Ereignisse, deren Titel einen dieser Begriffe enthalten, werden ausgeblendet. Beispiel: 'Privat|Meeting|Konferenz'",allowlist:"Zulassungsliste",allowlist_note:"Durch Pipes getrennte Liste von Begriffen zur Einbeziehung von Ereignissen. Wenn diese Liste nicht leer ist, werden nur Ereignisse angezeigt, deren Titel einen dieser Begriffe enthalten. Beispiel: 'Geburtstag|Jahrestag|Wichtig'",entity_overrides:"Entitäts-Überschreibungen",entity_overrides_note:"Diese Einstellungen überschreiben die globalen Haupteinstellungen für diesen bestimmten Kalender.",compact_events_to_show:"Kompakte Ereignisse zur Ansicht",entity_compact_events_note:"Anzahl der Ereignisse überschreiben, die für diesen Kalender im Kompaktmodus angezeigt werden sollen.",show_time:"Zeit anzeigen",entity_show_time_note:"Ereigniszeiten nur für diesen Kalender anzeigen oder ausblenden.",show_location:"Ort anzeigen",entity_show_location_note:"Veranstaltungsorte nur für diesen Kalender anzeigen oder ausblenden.",split_multiday_events:"Mehrtägige Ereignisse aufteilen",entity_split_multiday_note:"Für diesen Kalender mehrtägige Ereignisse in einzelne Tagessegmente aufteilen.",core_settings:"Haupteinstellungen",time_range:"Zeitbereich",time_range_note:"Dieser Zeitbereich definiert den regulären Anzeigemodus, der zur erweiterten Ansicht wird, wenn der Kompaktmodus konfiguriert ist.",days_to_show:"Anzahl Tage anzeigen",days_to_show_note:"Anzahl der Tage, die von der API abgerufen und im Kalender angezeigt werden sollen.",start_date:"Startdatum",start_date_mode:"Startdatumsmodus",start_date_mode_default:"Standard (heute)",start_date_mode_fixed:"Festes Datum",start_date_mode_offset:"Relatives Offset",start_date_fixed:"Festes Startdatum",start_date_offset:"Relatives Offset von heute",start_date_offset_note:"Eine positive oder negative Zahl eingeben, um den Wert vom heutigen Tag abzuweichen (z.B. +1 für morgen, -5 für vor fünf Tagen).",compact_mode:"Kompaktmodus",compact_mode_note:"Im Kompaktmodus werden zunächst weniger Tage und/oder Ereignisse angezeigt. Die Karte kann durch Tippen oder Halten auf die Vollansicht erweitert werden, wenn sie mit der Aktion 'Erweitern' konfiguriert ist.",compact_days_to_show:"Anzahl kompakter Tage anzeigen",compact_events_complete_days:"Komplette Tage im Kompaktmodus",compact_events_complete_days_note:"Wenn aktiviert und mindestens ein Ereignis eines Tages angezeigt wird, werden alle Ereignisse dieses Tages angezeigt.",event_visibility:"Sichtbarkeit von Ereignissen",show_past_events:"Vergangene Ereignisse anzeigen",show_empty_days:"Leere Tage anzeigen",filter_duplicates:"Doppelte Ereignisse filtern",language_time_formats:"Sprach- & Zeitformate",language:"Sprache",language_mode:"Sprachmodus",language_code:"Sprachcode",language_code_note:"Einen 2-Buchstaben-Sprachcode eingeben (z.B., 'en', 'de', 'fr')",time_24h:"Zeitformat",system:"Systemstandard",custom:"Benutzerdefiniert","12h":"12-Stunden","24h":"24-Stunden",appearance_layout:"Aussehen & Layout",title_styling:"Titelgestaltung",title:"Titel",title_font_size:"Schriftgröße",title_color:"Farbe",card_styling:"Kartengestaltung",background_color:"Hintergrundfarbe",height_mode:"Höhenmodus",auto:"Automatische Höhe",fixed:"Feste Höhe",maximum:"Maximale Höhe",height_value:"Höhenangabe",fixed_height_note:"Karte behält immer genau diese Höhe bei, unabhängig vom Inhalt",max_height_note:"Karte wächst mit Inhalt bis zu dieser maximalen Höhe",event_styling:"Ereignisgestaltung",event_background_opacity:"Ereignishintergrund-Opazität",vertical_line_width:"Vertikale Linienbreite",spacing_alignment:"Abstand & Ausrichtung",day_spacing:"Abstand Tag",event_spacing:"Abstand Ereignis",additional_card_spacing:"Zusätzlicher Kartenabstand",date_display:"Datumsanzeige",vertical_alignment:"Vertikale Ausrichtung",date_vertical_alignment:"Vertikale Datumsausrichtung",date_formatting:"Datumsformatierung",top:"Oben",middle:"Mitte",bottom:"Unten",weekday_font:"Wochentag Schrift",weekday_font_size:"Wochentag Schriftgröße",weekday_color:"Wochentag Farbe",day_font:"Tag Schrift",day_font_size:"Tag Schriftgröße",day_color:"Tag Farbe",month_font:"Monat Schrift",show_month:"Monat anzeigen",month_font_size:"Monat Schriftgröße",month_color:"Monat Farbe",weekend_highlighting:"Wochenende Hervorhebung",weekend_weekday_color:"Wochenende Wochentag Farbe",weekend_day_color:"Wochenende Tag Farbe",weekend_month_color:"Wochenende Monat Farbe",today_highlighting:"Heute Hervorhebung",today_weekday_color:"Heute Wochentag Farbe",today_day_color:"Heute Tag Farbe",today_month_color:"Heute Monat Farbe",today_indicator:"Heute Indikator",dot:"Gepunktet",pulse:"Pulsierend",glow:"Glühend",emoji:"Emoji",emoji_value:"Emoji",emoji_indicator_note:"Einzelnes Emoji-Zeichen eingeben wie 🗓️",image_path:"Bildpfad",image_indicator_note:"Pfad zum Bild wie /local/image.jpg",today_indicator_position:"Heute Indikator Position",today_indicator_color:"Heute Indikator Farbe",today_indicator_size:"Heute Indikator Größe",week_numbers_separators:"Wochennummern & Trennzeichen",week_numbers:"Wochennummerm",first_day_of_week:"Erster Tag der Woche",sunday:"Sonntag",monday:"Montag",show_week_numbers:"Wochennummern anzeigen",week_number_note_iso:"ISO (Europa/International): Die erste Woche enthält den ersten Donnerstag des Jahres. Erstellt eine einheitliche Wochennummerierung über die Jahre hinweg (ISO 8601 Standard).",week_number_note_simple:"Einfach (Nord-America): Wochen werden unabhängig vom Wochentag fortlaufend ab dem 1. Januar gezählt. Die erste Woche kann teilweise sein. Intuitiver, aber weniger standardisiert.",show_current_week_number:"Aktuelle Wochennummer anzeigen",week_number_font_size:"Wochennummer Schriftgröße",week_number_color:"Wochennummer Farbe",week_number_background_color:"Wochennummer Hintergerundfarbe",day_separator:"Tagestrenner",show_day_separator:"Tagestrenner anzeigen",day_separator_width:"Tagestrenner Breite",day_separator_color:"Tagestrenner Farbe",week_separator:"Wochentrenner",show_week_separator:"Wochentrenner anzeigen",week_separator_width:"Wochentrenner Breite",week_separator_color:"Wochentrenner Farbe",month_separator:"Monatstrenner",show_month_separator:"Monatstrenner anzeigen",month_separator_width:"Monatstrenner Breite",month_separator_color:"Monatstrenner Farbe",event_display:"Ereignisanzeige",event_title:"Ereignisname",event_font_size:"Ereignis Schriftgröße",empty_day_color:"Leerer Tag Farbe",time:"Zeit",show_single_allday_time:"Zeit für ganztägige Einzelveranstaltungen anzeigen",show_end_time:"Endzeit anzeigen",time_font_size:"Zeit Schriftgröße",time_color:"Zeit Farbe",time_icon_size:"Zeit Symbol Größe",location:"Ort",remove_location_country:"Land entfernen",location_font_size:"Ort Schriftgröße",location_color:"Ort Farbe",location_icon_size:"Ort Symbol Größe",custom_country_pattern:"Länder nach Muster entfernen",custom_country_pattern_note:"Ländernamen als reguläres Ausdrucksmuster eingeben (z.B., 'USA|United States|Canada'). Bei Ereignissen mit Orten, die mit diesen Mustern enden, wird das Land entfernt.",progress_indicators:"Fortschrittsindikatoren",show_countdown:"Countdown anzeigen",show_progress_bar:"Fortschrittsbalken anzeigen",progress_bar_color:"Fortschrittsbalken Farbe",progress_bar_height:"Fortschrittsbalken Höhe",progress_bar_width:"Fortschrittsbalken Breite",multiday_event_handling:"Mehrtägige Ereignisbehandlung",weather_integration:"Wetterintegration",weather_entity_position:"Wetter-Entität & Position",weather_entity:"Wetter-Entität",weather_position:"Wetterposition",date:"Datum",event:"Ereignis",both:"Beides",date_column_weather:"Datumsspalte Wetter",show_conditions:"Bedingungen anzeigen",show_high_temp:"Hohe Temperatur anzeigen",show_low_temp:"Niedrige Temperatur anzeigen",icon_size:"Symbolgröße",font_size:"Schriftgröße",color:"Farbe",event_row_weather:"Ereignisreihe Wetter",show_temp:"Temperatur anzeigen",interactions:"Interaktionen",tap_action:"Aktion antippen",hold_action:"Aktion halten",more_info:"Weitere Informationen",navigate:"Navigieren",url:"URL",call_service:"Service aufrufen",expand:"Kompakte/Erweiterte Ansicht umschalten",navigation_path:"Navigationspfad",url_path:"URL",service:"Service",service_data:"Service Daten (JSON)",refresh_settings:"Einstellungen aktualisieren",refresh_interval:"Aktualisierungsintervall (Minuten)",refresh_on_navigate:"Aktualisieren beim Zurücknavigieren",deprecated_config_detected:"Veraltete Konfigurationsoptionen erkannt.",deprecated_config_explanation:"Einige Optionen in dieser Konfiguration werden nicht mehr unterstützt.",deprecated_config_update_hint:"Bitte aktualisieren, um die Kompatibilität sicherzustellen.",update_config:"Konfiguration aktualisieren…"}},ht={daysOfWeek:["Κυρ","Δευ","Τρι","Τετ","Πεμ","Παρ","Σαβ"],fullDaysOfWeek:["Κυριακή","Δευτέρα","Τρίτη","Τετάρτη","Πέμπτη","Παρασκευή","Σάββατο"],months:["Ιαν","Φεβ","Μαρ","Απρ","Μαϊ","Ιουν","Ιουλ","Αυγ","Σεπ","Οκτ","Νοε","Δεκ"],allDay:"Ολοήμερο",multiDay:"έως",at:"στις",endsToday:"λήγει σήμερα",endsTomorrow:"λήγει αύριο",noEvents:"Δεν υπάρχουν προγραμματισμένα γεγονότα",loading:"Φόρτωση ημερολογίου...",error:"Σφάλμα: Η οντότητα ημερολογίου δεν βρέθηκε ή δεν έχει ρυθμιστεί σωστά"},ut={daysOfWeek:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],fullDaysOfWeek:["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],months:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],allDay:"all day",multiDay:"until",at:"at",endsToday:"ends today",endsTomorrow:"ends tomorrow",noEvents:"No upcoming events",loading:"Loading calendar events...",error:"Error: Calendar entity not found or improperly configured",editor:{calendar_entities:"Calendar Entities",calendar:"Calendar",entity_identification:"Entity Identification",entity:"Entity",add_calendar:"Add calendar",remove:"Remove",convert_to_advanced:"Convert to advanced",simple:"Simple",display_settings:"Display Settings",label:"Label",label_type:"Label Type",none:"None",text_emoji:"Text/Emoji",icon:"Icon",text_value:"Text Value",text_label_note:"Enter text or emoji like '📅 My Calendar'",image:"Image",image_label_note:"Path to image like /local/calendar.jpg",label_note:"Custom label for this calendar.",colors:"Colors",event_color:"Event color",entity_color_note:"Custom color for event titles from this calendar.",accent_color:"Accent color",entity_accent_color_note:"Custom accent color for the vertical line of events from this calendar. This color will also be used as the event background color when 'event_background_opacity' is >0.",event_filtering:"Event Filtering",blocklist:"Blocklist",blocklist_note:"Pipe-separated list of terms to exclude events. Events with titles containing any of these terms will be hidden. Example: 'Private|Meeting|Conference'",allowlist:"Allowlist",allowlist_note:"Pipe-separated list of terms to include events. If not empty, only events with titles containing any of these terms will be shown. Example: 'Birthday|Anniversary|Important'",entity_overrides:"Entity Overrides",entity_overrides_note:"These settings will override the global core settings for this specific calendar.",compact_events_to_show:"Compact events to show",entity_compact_events_note:"Override the number of events to show in compact mode for this calendar.",show_time:"Show time",entity_show_time_note:"Show or hide event times for this calendar only.",show_location:"Show location",entity_show_location_note:"Show or hide event locations for this calendar only.",split_multiday_events:"Split multi-day events",entity_split_multiday_note:"Split multi-day events into individual day segments for this calendar.",core_settings:"Core Settings",time_range:"Time Range",time_range_note:"This time range defines the regular display mode, which becomes the expanded view if compact mode is configured.",days_to_show:"Days to show",days_to_show_note:"Number of days to fetch from API and display in the calendar",start_date:"Start date",start_date_mode:"Start date mode",start_date_mode_default:"Default (today)",start_date_mode_fixed:"Fixed date",start_date_mode_offset:"Relative offset",start_date_fixed:"Fixed start date",start_date_offset:"Relative offset from today",start_date_offset_note:"Enter a positive or negative number to offset from today (e.g., +1 for tomorrow, -5 for five days ago).",compact_mode:"Compact Mode",compact_mode_note:"Compact mode shows fewer days and/or events initially. The card can be expanded to full view using a tap or hold action if configured with action: 'expand'.",compact_days_to_show:"Compact days to show",compact_events_complete_days:"Complete days in compact mode",compact_events_complete_days_note:"When enabled, if at least one event from a day is shown, all events from that day will be displayed.",event_visibility:"Event Visibility",show_past_events:"Show past events",show_empty_days:"Show empty days",filter_duplicates:"Filter duplicate events",language_time_formats:"Language & Time Formats",language:"Language",language_mode:"Language Mode",language_code:"Language Code",language_code_note:"Enter a 2-letter language code (e.g., 'en', 'de', 'fr')",time_24h:"Time format",system:"System default",custom:"Custom","12h":"12-hour","24h":"24-hour",appearance_layout:"Appearance & Layout",title_styling:"Title Styling",title:"Title",title_font_size:"Title font size",title_color:"Title color",card_styling:"Card Styling",background_color:"Background color",height_mode:"Height mode",auto:"Auto height",fixed:"Fixed height",maximum:"Maximum height",height_value:"Height value",fixed_height_note:"Card always maintains exactly this height regardless of content",max_height_note:"Card grows with content up to this maximum height",event_styling:"Event Styling",event_background_opacity:"Event background opacity",vertical_line_width:"Vertical line width",spacing_alignment:"Spacing & Alignment",day_spacing:"Day spacing",event_spacing:"Event spacing",additional_card_spacing:"Additional card spacing",date_display:"Date Display",vertical_alignment:"Vertical Alignment",date_vertical_alignment:"Date vertical alignment",date_formatting:"Date Formatting",top:"Top",middle:"Middle",bottom:"Bottom",weekday_font:"Weekday font",weekday_font_size:"Weekday font size",weekday_color:"Weekday color",day_font:"Day font",day_font_size:"Day font size",day_color:"Day color",month_font:"Month font",show_month:"Show month",month_font_size:"Month font size",month_color:"Month color",weekend_highlighting:"Weekend Highlighting",weekend_weekday_color:"Weekend weekday color",weekend_day_color:"Weekend day color",weekend_month_color:"Weekend month color",today_highlighting:"Today Highlighting",today_weekday_color:"Today weekday color",today_day_color:"Today day color",today_month_color:"Today month color",today_indicator:"Today indicator",dot:"Dot",pulse:"Pulse",glow:"Glow",emoji:"Emoji",emoji_value:"Emoji",emoji_indicator_note:"Enter a single emoji character like 🗓️",image_path:"Image path",image_indicator_note:"Path to image like /local/image.jpg",today_indicator_position:"Today indicator position",today_indicator_color:"Today indicator color",today_indicator_size:"Today indicator size",week_numbers_separators:"Week Numbers & Separators",week_numbers:"Week numbers",first_day_of_week:"First day of week",sunday:"Sunday",monday:"Monday",show_week_numbers:"Show week numbers",week_number_note_iso:"ISO (Europe/International): First week contains the first Thursday of the year. Creates consistent week numbering across years (ISO 8601 standard).",week_number_note_simple:"Simple (North America): Weeks count sequentially from January 1st regardless of weekday. First week may be partial. More intuitive but less standardized.",show_current_week_number:"Show current week number",week_number_font_size:"Week number font size",week_number_color:"Week number color",week_number_background_color:"Week number background color",day_separator:"Day separator",show_day_separator:"Show day separator",day_separator_width:"Day separator width",day_separator_color:"Day separator color",week_separator:"Week separator",show_week_separator:"Show week separator",week_separator_width:"Week separator width",week_separator_color:"Week separator color",month_separator:"Month separator",show_month_separator:"Show month separator",month_separator_width:"Month separator width",month_separator_color:"Month separator color",event_display:"Event Display",event_title:"Event Title",event_font_size:"Event font size",empty_day_color:"Empty day color",time:"Time",show_single_allday_time:"Show time for all-day single events",show_end_time:"Show end time",time_font_size:"Time font size",time_color:"Time color",time_icon_size:"Time icon size",location:"Location",remove_location_country:"Remove location country",location_font_size:"Location font size",location_color:"Location color",location_icon_size:"Location icon size",custom_country_pattern:"Country patterns to remove",custom_country_pattern_note:"Enter country names as a regular expression pattern (e.g., 'USA|United States|Canada'). Events with locations ending with these patterns will have the country removed.",progress_indicators:"Progress Indicators",show_countdown:"Show countdown",show_progress_bar:"Show progress bar",progress_bar_color:"Progress bar color",progress_bar_height:"Progress bar height",progress_bar_width:"Progress bar width",multiday_event_handling:"Multi-day Event Handling",weather_integration:"Weather Integration",weather_entity_position:"Weather Entity & Position",weather_entity:"Weather entity",weather_position:"Weather position",date:"Date",event:"Event",both:"Both",date_column_weather:"Date Column Weather",show_conditions:"Show conditions",show_high_temp:"Show high temperature",show_low_temp:"Show low temperature",icon_size:"Icon size",font_size:"Font size",color:"Color",event_row_weather:"Event Row Weather",show_temp:"Show temperature",interactions:"Interactions",tap_action:"Tap Action",hold_action:"Hold Action",more_info:"More Info",navigate:"Navigate",url:"URL",call_service:"Call Service",expand:"Toggle Compact/Expanded View",navigation_path:"Navigation path",url_path:"URL",service:"Service",service_data:"Service data (JSON)",refresh_settings:"Refresh Settings",refresh_interval:"Refresh interval (minutes)",refresh_on_navigate:"Refresh when navigating back",deprecated_config_detected:"Deprecated config options detected.",deprecated_config_explanation:"Some options in your configuration are no longer supported.",deprecated_config_update_hint:"Please update to ensure compatibility.",update_config:"Update config…"}},mt={daysOfWeek:["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"],fullDaysOfWeek:["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"],months:["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],allDay:"todo el día",multiDay:"hasta",at:"a las",endsToday:"termina hoy",endsTomorrow:"termina mañana",noEvents:"No hay eventos próximos",loading:"Cargando eventos del calendario...",error:"Error: La entidad del calendario no se encontró o está mal configurada"},gt={daysOfWeek:["Su","Ma","Ti","Ke","To","Pe","La"],fullDaysOfWeek:["Sunnuntai","Maanantai","Tiistai","Keskiviikko","Torstai","Perjantai","Lauantai"],months:["Tammi","Helmi","Maalis","Huhti","Touko","Kesä","Heinä","Elo","Syys","Loka","Marras","Joulu"],allDay:"koko päivä",multiDay:"asti",at:"klo",endsToday:"päättyy tänään",endsTomorrow:"päättyy huomenna",noEvents:"Ei tulevia tapahtumia",loading:"Ladataan kalenteritapahtumia...",error:"Virhe: Kalenteriyksikköä ei löydy tai se on väärin määritetty"},pt={daysOfWeek:["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],fullDaysOfWeek:["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"],months:["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"],allDay:"toute la journée",multiDay:"jusqu'au",at:"à",endsToday:"finit aujourd'hui",endsTomorrow:"finit demain",noEvents:"Aucun événement à venir",loading:"Chargement des événements...",error:"Erreur: Entité de calendrier introuvable ou mal configurée"},ft={daysOfWeek:["א'","ב'","ג'","ד'","ה'","ו'","ש'"],fullDaysOfWeek:["ראשון","שני","שלישי","רביעי","חמישי","שישי","שבת"],months:["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"],allDay:"כל-היום",multiDay:"עד",endsToday:"מסתיים היום",endsTomorrow:"מסתיים מחר",at:"בשעה",noEvents:"אין אירועים קרובים",loading:"טוען אירועי לוח שנה...",error:"שגיאה: ישות לוח השנה לא נמצאה או לא מוגדרת כראוי"},yt={daysOfWeek:["Ned","Pon","Uto","Sri","Čet","Pet","Sub"],fullDaysOfWeek:["Nedjelja","Ponedjeljak","Utorak","Srijeda","Četvrtak","Petak","Subota"],months:["Sij","Velj","Ožu","Tra","Svi","Lip","Srp","Kol","Ruj","Lis","Stu","Pro"],allDay:"cijeli dan",multiDay:"do",at:"u",endsToday:"završava danas",endsTomorrow:"završava sutra",noEvents:"Nema nadolazećih događaja",loading:"Učitavanje događaja...",error:"Greška: Kalendar entitet nije pronađen ili je neispravno postavljen"},vt={daysOfWeek:["Vas","Hét","Kedd","Sze","Csüt","Pén","Szo"],fullDaysOfWeek:["Vasárnap","Hétfő","Kedd","Szerda","Csütörtök","Péntek","Szombat"],months:["Jan","Feb","Már","Ápr","Máj","Jún","Júl","Aug","Szep","Okt","Nov","Dec"],allDay:"egész napos",multiDay:"eddig:",endsToday:"ma este ér véget",endsTomorrow:"holnap ér véget",at:"itt:",noEvents:"Mára nincs több esemény",loading:"Naptárbejegyzések betöltése...",error:"Hiba: Naptár entitás nem található vagy nem megfelelően konfigutált"};const wt={bg:st,cs:lt,ca:dt,da:_t,de:ct,el:ht,en:ut,es:mt,fi:gt,fr:pt,he:ft,hr:yt,hu:vt,is:{daysOfWeek:["Sun","Mán","Þri","Mið","Fim","Fös","Lau"],fullDaysOfWeek:["Sunnudagur","Mánudagur","Þriðjudagur","Miðvikudagur","Fimmtudagur","Föstudagur","Laugardagur"],months:["Jan","Feb","Mar","Apr","Maí","Jún","Júl","Ágú","Sep","Okt","Nóv","Des"],allDay:"Allur dagurinn",multiDay:"þar til",at:"kl",endsToday:"lýkur í dag",endsTomorrow:"lýkur á morgun",noEvents:"Engir viðburðir á næstunni",loading:"Hleður inn dagatal...",error:"Villa: Dagatalseining finnst ekki eða er vanstillt"},it:{daysOfWeek:["Dom","Lun","Mar","Mer","Gio","Ven","Sab"],fullDaysOfWeek:["Domenica","Lunedì","Martedì","Mercoledì","Giovedì","Venerdì","Sabato"],months:["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"],allDay:"tutto-il-giorno",multiDay:"fino a",at:"a",endsToday:"termina oggi",endsTomorrow:"termina domani",noEvents:"Nessun evento programmato",loading:"Sto caricando il calendario degli eventi...",error:"Errore: Entità Calendario non trovata o non configurata correttamente"},nb:{daysOfWeek:["Søn","Man","Tir","Ons","Tor","Fre","Lør"],fullDaysOfWeek:["Søndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag"],months:["Jan","Feb","Mar","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Des"],allDay:"hele dagen",multiDay:"inntil",at:"kl. ",endsToday:"slutter i dag",endsTomorrow:"slutter i morgen",noEvents:"Ingen kommende hendelser",loading:"Laster kalenderhendelser...",error:"Feil: Kalenderenheten ble ikke funnet eller er ikke konfigurert riktig",editor:{calendar_entities:"kalenderhendelser",calendar:"Kalender",entity_identification:"Enhetsidentifikasjon",entity:"Enhet",add_calendar:"Legg til kalender",remove:"Fjern",convert_to_advanced:"Konverter til avansert",simple:"Enkel",display_settings:"Visningsinnstillinger",label:"Etikett",label_type:"Etiketttype",none:"Ingen",text_emoji:"Tekst/Emoji",icon:"Ikon",text_value:"Tekstverdi",text_label_note:"Skriv inn tekst eller emoji som '📅 Min Kalender'",image:"Bilde",image_label_note:"Sti til bilde som /local/calendar.jpg",label_note:"Egendefinert etikett for denne kalenderen.",colors:"Farger",event_color:"Hendelsefarge",entity_color_note:"Egendefinert farge for hendelsestitlene fra denne kalenderen.",accent_color:"Aksentfarge",entity_accent_color_note:"Egendefinert aksentfarge for den vertikale linjen til hendelser fra denne kalenderen. Denne fargen vil også bli brukt som bakgrunnsfarge for hendelser når 'event_background_opacity' er >0.",event_filtering:"Hendelsesfiltrering",blocklist:"Blokkeringsliste",blocklist_note:"Pipe-separert liste med uttrykk for å ekskludere hendelser. Hendelser med titler som inneholder noen av disse uttrykkene vil bli skjult. Eksempel: 'Privat|Møte|Konferanse'",allowlist:"Tillattliste",allowlist_note:"Pipe-separert liste med uttrykk for å inkludere hendelser. Hvis ikke tom, vil kun hendelser med titler som inneholder noen av disse uttrykkene bli vist. Eksempel: 'Fødselsdag|Jubileum|Viktig'",entity_overrides:"Enhetsoverstyringer",entity_overrides_note:"Disse innstillingene vil overstyre de globale kjerneinnstillingene for denne spesifikke kalenderen.",compact_events_to_show:"Kompakte hendelser å vise",entity_compact_events_note:"Overstyr antall hendelser som skal vises i kompakt modus for denne kalenderen.",show_time:"Vis tid",entity_show_time_note:"Vis eller skjul hendelsestider bare for denne kalenderen.",show_location:"Vis sted",entity_show_location_note:"Vis eller skjul hendelsessteder bare for denne kalenderen.",split_multiday_events:"Del flerdagshendelser",entity_split_multiday_note:"Del flerdagshendelser i individuelle dagssegmenter for denne kalenderen.",core_settings:"Kjerneinnstillinger",time_range:"Tidsområde",time_range_note:"Dette tidsområdet definerer normal visningsmodus, som blir den utvidede visningen hvis kompakt modus er konfigurert.",days_to_show:"Dager å vise",days_to_show_note:"Antall dager å hente fra API og vise i kalenderen",start_date:"Startdato",start_date_mode:"Startdatomodus",start_date_mode_default:"Standard (i dag)",start_date_mode_fixed:"Fast dato",start_date_mode_offset:"Relativt offset",start_date_fixed:"Fast startdato",start_date_offset:"Relativt offset fra i dag",start_date_offset_note:"Skriv inn et positivt eller negativt tall for å forskyve fra i dag (f.eks. +1 for i morgen, -5 for fem dager siden).",compact_mode:"Kompakt modus",compact_mode_note:"Kompakt modus viser færre dager og/eller hendelser i utgangspunktet. Kortet kan utvides til full visning ved hjelp av et trykk eller hold-handling hvis konfigurert med handling: 'expand'.",compact_days_to_show:"Kompakte dager å vise",compact_events_complete_days:"Komplette dager i kompakt modus",compact_events_complete_days_note:"Når aktivert, hvis minst én hendelse fra en dag vises, vil alle hendelser fra den dagen bli vist.",event_visibility:"Hendelsessynlighet",show_past_events:"Vis tidligere hendelser",show_empty_days:"Vis tomme dager",filter_duplicates:"Filtrer duplikate hendelser",language_time_formats:"Språk og tidsformater",language:"Språk",language_mode:"Språkmodus",language_code:"Språkkode",language_code_note:"Skriv inn en 2-bokstavs språkkode (f.eks. 'nb', 'en', 'de')",time_24h:"Tidsformat",system:"Systemstandard",custom:"Egendefinert","12h":"12-timer","24h":"24-timer",appearance_layout:"Utseende og layout",title_styling:"Tittelformatering",title:"Tittel",title_font_size:"Tittel skriftstørrelse",title_color:"Tittelfarge",card_styling:"Kortformatering",background_color:"Bakgrunnsfarge",height_mode:"Høydemodus",auto:"Automatisk høyde",fixed:"Fast høyde",maximum:"Maksimal høyde",height_value:"Høydeverdi",fixed_height_note:"Kortet opprettholder alltid nøyaktig denne høyden uavhengig av innhold",max_height_note:"Kortet vokser med innholdet opp til denne maksimale høyden",event_styling:"Hendelsesformatering",event_background_opacity:"Hendelse bakgrunnsopasitet",vertical_line_width:"Vertikal linjebredde",spacing_alignment:"Avstand og justering",day_spacing:"Dag avstand",event_spacing:"Hendelse avstand",additional_card_spacing:"Ekstra kortavstand",date_display:"Datovisning",vertical_alignment:"Vertikal justering",date_vertical_alignment:"Dato vertikal justering",date_formatting:"Datoformatering",top:"Topp",middle:"Midten",bottom:"Bunn",weekday_font:"Ukedagsskrift",weekday_font_size:"Ukedagsskriftstørrelse",weekday_color:"Ukedagsfarge",day_font:"Dagsskrift",day_font_size:"Dagsskriftstørrelse",day_color:"Dagsfarge",month_font:"Månedsskrift",show_month:"Vis måned",month_font_size:"Månedsskriftstørrelse",month_color:"Månedsfarge",weekend_highlighting:"Helgefremheving",weekend_weekday_color:"Helg ukedagsfarge",weekend_day_color:"Helg dagsfarge",weekend_month_color:"Helg månedsfarge",today_highlighting:"I dag fremheving",today_weekday_color:"I dag ukedagsfarge",today_day_color:"I dag dagsfarge",today_month_color:"I dag månedsfarge",today_indicator:"I dag indikator",dot:"Prikk",pulse:"Puls",glow:"Glød",emoji:"Emoji",emoji_value:"Emoji",emoji_indicator_note:"Skriv inn et enkelt emoji-tegn som 🗓️",image_path:"Bildesti",image_indicator_note:"Sti til bilde som /local/image.jpg",today_indicator_position:"I dag indikatorposisjon",today_indicator_color:"I dag indikatorfarge",today_indicator_size:"I dag indikatorstørrelse",week_numbers_separators:"Ukenumre og skillelinjer",week_numbers:"Ukenumre",first_day_of_week:"Første dag i uken",sunday:"Søndag",monday:"Mandag",show_week_numbers:"Vis ukenumre",week_number_note_iso:"ISO (Europa/Internasjonal): Første uke inneholder første torsdag i året. Gir konsistent ukenummerering på tvers av år (ISO 8601-standard).",week_number_note_simple:"Enkel (Nord-Amerika): Uker telles sekvensielt fra 1. januar uavhengig av ukedag. Første uke kan være delvis. Mer intuitiv, men mindre standardisert.",show_current_week_number:"Vis gjeldende ukenummer",week_number_font_size:"Ukenummer skriftstørrelse",week_number_color:"Ukenummerfarge",week_number_background_color:"Ukenummer bakgrunnsfarge",day_separator:"Dagsskillelinje",show_day_separator:"Vis dagsskillelinje",day_separator_width:"Dagsskillelinje bredde",day_separator_color:"Dagsskillelinje farge",week_separator:"Ukeskillelinje",show_week_separator:"Vis ukeskillelinje",week_separator_width:"Ukeskillelinje bredde",week_separator_color:"Ukeskillelinje farge",month_separator:"Månedsskillelinje",show_month_separator:"Vis månedsskillelinje",month_separator_width:"Månedsskillelinje bredde",month_separator_color:"Månedsskillelinje farge",event_display:"Hendelsesvisning",event_title:"Hendelsestitttel",event_font_size:"Hendelsesskriftstørrelse",empty_day_color:"Tom dagsfarge",time:"Tid",show_single_allday_time:"Vis tid for heldagshendelser",show_end_time:"Vis sluttid",time_font_size:"Tidsskriftstørrelse",time_color:"Tidsfarge",time_icon_size:"Tidsikonstørrelse",location:"Sted",remove_location_country:"Fjern stedets land",location_font_size:"Stedsskriftstørrelse",location_color:"Stedsfarge",location_icon_size:"Stedsikonstørrelse",custom_country_pattern:"Landsmønstre å fjerne",custom_country_pattern_note:"Skriv inn landsnavn som et regulært uttrykksmønster (f.eks. 'Norge|USA|Sverige'). Hendelser med steder som slutter med disse mønstrene vil få landet fjernet.",progress_indicators:"Fremgangsindikatorer",show_countdown:"Vis nedtelling",show_progress_bar:"Vis fremdriftslinje",progress_bar_color:"Fremdriftslinjefarge",progress_bar_height:"Fremdriftslinjehøyde",progress_bar_width:"Fremdriftslinje bredde",multiday_event_handling:"Flerdagshendelseshåndtering",weather_integration:"Værintegrasjon",weather_entity_position:"Værenhet og posisjon",weather_entity:"Værenhet",weather_position:"Værposisjon",date:"Dato",event:"Hendelse",both:"Begge",date_column_weather:"Datokolonne vær",show_conditions:"Vis værforhold",show_high_temp:"Vis høy temperatur",show_low_temp:"Vis lav temperatur",icon_size:"Ikonstørrelse",font_size:"Skriftstørrelse",color:"Farge",event_row_weather:"Hendelsesrad vær",show_temp:"Vis temperatur",interactions:"Interaksjoner",tap_action:"Trykkehandling",hold_action:"Holdehandling",more_info:"Mer info",navigate:"Naviger",url:"URL",call_service:"Kall tjeneste",expand:"Bytt kompakt/utvidet visning",navigation_path:"Navigasjonssti",url_path:"URL",service:"Tjeneste",service_data:"Tjenestedata (JSON)",refresh_settings:"Oppdateringsinnstillinger",refresh_interval:"Oppdateringsintervall (minutter)",refresh_on_navigate:"Oppdater ved navigering tilbake",deprecated_config_detected:"Utdaterte konfigurasjonsalternativer oppdaget.",deprecated_config_explanation:"Noen alternativer i konfigurasjonen din støttes ikke lenger.",deprecated_config_update_hint:"Vennligst oppdater for å sikre kompatibilitet.",update_config:"Oppdater konfigurasjon"}},nl:{daysOfWeek:["Zo","Ma","Di","Wo","Do","Vr","Za"],fullDaysOfWeek:["zondag","maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag"],months:["Jan","Feb","Mrt","Apr","Mei","Jun","Jul","Aug","Sep","Okt","Nov","Dec"],allDay:"hele dag",multiDay:"tot",at:"om",endsToday:"eindigt vandaag",endsTomorrow:"eindigt morgen",noEvents:"Geen afspraken gepland",loading:"Kalender afspraken laden...",error:"Fout: Kalender niet gevonden of verkeerd geconfigureerd"},nn:{daysOfWeek:["Søn","Mån","Tys","Ons","Tor","Fre","Lau"],fullDaysOfWeek:["Søndag","Måndag","Tysdag","Onsdag","Torsdag","Fredag","Laurdag"],months:["Jan","Feb","Mar","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Des"],allDay:"heile dagen",multiDay:"inntil",at:"kl. ",endsToday:"sluttar i dag",endsTomorrow:"sluttar i morgon",noEvents:"Ingen kommande hendingar",loading:"Lastar kalenderhendingar...",error:"Feil: Kalendereininga vart ikkje funnen eller er ikkje konfigurert riktig"},pl:{daysOfWeek:["Nd","Pn","Wt","Śr","Cz","Pt","Sb"],fullDaysOfWeek:["niedzieli","poniedziałku","wtorku","środy","czwartku","piątku","soboty"],months:["sty","lut","mar","kwi","maj","cze","lip","sie","wrz","paź","lis","gru"],allDay:"cały dzień",multiDay:"do",at:"o",endsToday:"kończy się dziś",endsTomorrow:"kończy się jutro",noEvents:"Brak nadchodzących wydarzeń",loading:"Ładowanie wydarzeń z kalendarza...",error:"Błąd: encja kalendarza nie została znaleziona lub jest niepoprawnie skonfigurowana"},pt:{daysOfWeek:["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"],fullDaysOfWeek:["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"],months:["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],allDay:"o dia todo",multiDay:"até",at:"às",endsToday:"termina hoje",endsTomorrow:"termina amanhã",noEvents:"Nenhum evento próximo",loading:"Carregando eventos do calendário...",error:"Erro: A entidade do calendário não foi encontrada ou está configurada incorretamente"},ro:{daysOfWeek:["Du","Lu","Ma","Mi","Jo","Vi","Sa"],fullDaysOfWeek:["Duminica","Luni","Marti","Miercuri","Joi","Vineri","Sambata"],months:["Ian","Feb","Mart","Apr","Mai","Iun","Iul","Aug","Sept","Oct","Nov","Dec"],allDay:"toata ziua",multiDay:"pana la",at:"la",endsToday:"se incheie astazi",endsTomorrow:"se incheie maine",noEvents:"Nu sunt evenimente viitoare",loading:"Incarcare evenimente de calendar...",error:"Eroare: Entitatea de calendar nu a fost gasita sau este configurata incorect"},ru:{daysOfWeek:["Вс","Пн","Вт","Ср","Чт","Пт","Сб"],fullDaysOfWeek:["воскресенья","понедельника","вторника","среды","четверга","пятницы","субботы"],months:["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"],allDay:"весь день",multiDay:"до",at:"в",endsToday:"заканчивается сегодня",endsTomorrow:"заканчивается завтра",noEvents:"Нет предстоящих событий",loading:"Загрузка событий календаря...",error:"Ошибка: Объект календарь, не найден или неправильно настроен"},sl:{daysOfWeek:["ned","pon","tor","sre","čet","pet","sob"],fullDaysOfWeek:["nedelja","ponedeljek","torek","sreda","četrtek","petek","sobota"],months:["jan","feb","mar","apr","maj","jun","jul","avg","sep","okt","nov","dec"],allDay:"cel dan",multiDay:"do",at:"ob",endsToday:"konča se danes",endsTomorrow:"konča se jutri",noEvents:"Ni planiranih dogodkov",loading:"Nalagam dogodke...",error:"Napaka: Entiteta ni bila najdena ali pa je nepravilno konfigurirana."},sk:{daysOfWeek:["Ne","Po","Ut","St","Št","Pi","So"],fullDaysOfWeek:["Nedeľa","Pondelok","Utorok","Streda","Štvrtok","Piatok","Sobota"],months:["Jan","Feb","Mar","Apr","Máj","Jún","Júl","Aug","Sep","Okt","Nov","Dec"],allDay:"celý deň",multiDay:"do",at:"v",endsToday:"končí dnes",endsTomorrow:"končí zajtra",noEvents:"Žiadne udalosti",loading:"Načítavam udalosti z kalendára...",error:"Chyba: Entita kalendára nebola nájdená alebo je nesprávne nakonfigurovaná",editor:{calendar_entities:"Entity kalendára",calendar:"Kalendár",entity_identification:"ID entity",entity:"Entita",add_calendar:"Pridať kalendár",remove:"Odstrániť",convert_to_advanced:"Previesť na pokročilé",simple:"Jednoduché",display_settings:"Nastavenia zobrazenia",label:"Menovka",label_type:"Typ menovky",none:"Žiadna",text_emoji:"Textová/Emodži",icon:"Ikona",text_value:"Textová hodnota",text_label_note:"Zadajte text alebo emodži, napr. '📅 Môj kalendár'",image:"Obrázok",image_label_note:"Cesta k obrázku, napr. /local/calendar.jpg",label_note:"Vlastná menovka tohto kalendára.",colors:"Farby",event_color:"Farba udalosti",entity_color_note:"Vlastná farba pre názvy udalostí v tomto kalendári.",accent_color:"Farba zvýraznenia",entity_accent_color_note:"Vlastná farba zvýraznenia zvislej čiary udalostí v tomto kalendári. Táto farba zároveň použije aj ako pozadie udalosti, ak je atribút 'event_background_opacity' väčší ako nula.",event_filtering:"Filtrovanie udalostí",blocklist:"Zoznam zakázaných (blocklist)",blocklist_note:"Zvislou čiarou (|) oddelený zoznam výrazov slúžiacich na výber ignorovaných udalostí. Udalosti s názvom obsahujúcim akýkoľvek z uvedených výrazov budú skryté. Príklad: 'Súkromné|Porada|Konferencia'",allowlist:"Zoznam povolených (allowlist)",allowlist_note:"Zvislou čiarou (|) oddelený zoznam výrazov slúžiacich na výber povolených udalostí. Ak obsahuje hodnotu, zobrazia sa iba udalosti obsahujúce jeden z uvedených výrazov. Príklad: 'Narodeniny|Výročie|Dôležité'",entity_overrides:"Úpravy nastavení",entity_overrides_note:"Tieto nastavenie prepíšu globálne nastavenia pre konkrétny kalendár.",compact_events_to_show:"Zhutniť zobrazené udalosti",entity_compact_events_note:"Zmeniť počet udalostí tohto kalendára, ktoré budú zobrazené v kompaktnom režime.",show_time:"Zobrazovať čas",entity_show_time_note:"Zobraziť alebo skryť čas udalostí v tomto kalendári.",show_location:"Zobrazovať miesto",entity_show_location_note:"Zobraziť alebo skryť miesto udalostí v tomto kalendári.",split_multiday_events:"Rozdeľovať niekoľkodňové udalosti",entity_split_multiday_note:"Rozdeliť niekoľkodňové udalosti v tomto kalendári do jednotlivých dní.",core_settings:"Globálne nastavenia",time_range:"Časový rozsah",time_range_note:"Tento časový rozsah nastavuje režim normálneho zobrazenia, ktorý sa stane rozšíreným zobrazením, ak je nakonfigurovaný kompaktný režim.",days_to_show:"Zobrazované dni",days_to_show_note:"Počet dní, ktoré sa majú z API načítavať a zobrazovať v kalendári",start_date:"Počiatočný dátum",start_date_mode:"Režim počiatočného dátumu",start_date_mode_default:"Predvolený (dnes)",start_date_mode_fixed:"Pevný dátum",start_date_mode_offset:"Relatívny posun",start_date_fixed:"Pevný dátum začiatku",start_date_offset:"Relatívny posun od dneška",start_date_offset_note:"Zadajte kladné alebo záporné číslo, ktoré sa pripočíta/odpočíta od dneška (napr. +1 pre zajtrajšok, -5 pre termín pred 5 dňami).",compact_mode:"Kompaktný režim",compact_mode_note:"Kompaktný režim zobrazuje na začiatok menej dní a/alebo udalostí. Kartu môžete rozbaliť na plné zobrazenie akciou kliknutia alebo podržania, ak jej nastavíte akciu: 'expand'.",compact_days_to_show:"Kompaktné dni, ktoré sa zobrazia",compact_events_complete_days:"Úplné dni v kompaktnom režime",compact_events_complete_days_note:"Ak je táto voľba zapnutá, pri zobrazení aspoň jednej udalosti z daného dňa sa budú zobrazovať všetky udalosti v tento deň.",event_visibility:"Viditeľnosť udalostí",show_past_events:"Zobrazovať udalosti, ktoré už prebehli",show_empty_days:"Zobrazovať prázdne dni",filter_duplicates:"Filtrovať duplicitné udalosti",language_time_formats:"Jazyk a formát času",language:"Jazyk",language_mode:"Režim jazyka",language_code:"Kód jazyka",language_code_note:"Zadajte dvojpísmenný kód jazyka (napr. 'en', 'sk', 'cs')",time_24h:"Formát času",system:"Predvolený systémom",custom:"Vlastný","12h":"12 hod.","24h":"24 hod.",appearance_layout:"Vzhľad a rozloženie",title_styling:"Štýl názvu",title:"Názov",title_font_size:"Veľkosť písma názvu",title_color:"Farba názvu",card_styling:"Štýl karty",background_color:"Farba pozadia",height_mode:"Režim výšky",auto:"Automatická výška",fixed:"Pevná výška",maximum:"Maximálna výška",height_value:"Hodnota výšky",fixed_height_note:"Karta vždy používa presne túto výšku bez ohľadu na zobrazený obsah",max_height_note:"Výška karty sa zväčšuje podľa zobrazeného obsahu až do uvedenej maximálnej hodnoty",event_styling:"Štýl udalostí",event_background_opacity:"Nepriehľadnosť pozadia udalostí",vertical_line_width:"Šírka zvislej čiary",spacing_alignment:"Medzery a zarovnanie",day_spacing:"Medzery medzi dňami",event_spacing:"Medzery medzi udalosťami",additional_card_spacing:"Dodatočné medzery karty",date_display:"Zobrazenie dátumu",vertical_alignment:"Zvislé zarovnanie",date_vertical_alignment:"Zvislé zarovnanie dátumu",date_formatting:"Formátovanie dátumu",top:"Hore",middle:"Stred",bottom:"Dole",weekday_font:"Písmo pracovného dňa",weekday_font_size:"Veľkosť písma pracovného dňa",weekday_color:"Farba pracovného dňa",day_font:"Písmo dňa",day_font_size:"Veľkosť písma dňa",day_color:"Farba dňa",month_font:"Písmo mesiaca",show_month:"Zobrazovať mesiac",month_font_size:"Veľkosť písma mesiaca",month_color:"Farba mesiaca",weekend_highlighting:"Zvýraznenie víkendu",weekend_weekday_color:"Farba pracovného dňa",weekend_day_color:"Farba víkendového dňa",weekend_month_color:"Farba víkendu v mesiaci",today_highlighting:"Zvýraznenie dneška",today_weekday_color:"Farba dnešného pracovného dňa",today_day_color:"Farba dneška",today_month_color:"Farba dneška v mesiaci",today_indicator:"Identifikátor dneška",dot:"Bodka",pulse:"Pulz",glow:"Žiara",emoji:"Emodži",emoji_value:"Emodži",emoji_indicator_note:"Zadajte jeden znak emodži, napr. 🗓️",image_path:"Cesta k obrázku",image_indicator_note:"Cesta k obrázku, napr. /local/image.jpg",today_indicator_position:"Umiestnenie identifikátora dneška",today_indicator_color:"Farba identifikátora dneška",today_indicator_size:"Veľkosť identifikátora dneška",week_numbers_separators:"Čísla týždňov a oddeľovače",week_numbers:"Čísla týždňov",first_day_of_week:"Prvý deň týždňa",sunday:"Nedeľa",monday:"Pondelok",show_week_numbers:"Zobrazovať čísla týždňov",week_number_note_iso:"ISO (Európa/Medzinárodné): Prvý týždeň zahŕňa prvý štvrtok v roku. Vytvára konzistentné číslovanie týždňov medzi jednotlivými rokmi (štandard ISO 8601).",week_number_note_simple:"Jednoduché (Severná Amerika): Týždne sú číslované od prvého januára bez ohľadu na deň týždňa. Prvý týždeň nemusí byť úplný. Intuitívnejší, ale menej štandardizovaný.",show_current_week_number:"Zobrazovať aktuálne číslo týždňa",week_number_font_size:"Veľkosť písma čísla týždňa",week_number_color:"Farba čísla týždňa",week_number_background_color:"Farba pozadia čísla týždňa",day_separator:"Oddeľovač dní",show_day_separator:"Zobrazovať oddeľovač dní",day_separator_width:"Šírka oddeľovača dní",day_separator_color:"Farba oddeľovača dní",week_separator:"Oddeľovač týždňov",show_week_separator:"Zobrazovať oddeľovač týždňov",week_separator_width:"Šírka oddeľovača týždňov",week_separator_color:"Farba oddeľovača týždňov",month_separator:"Oddeľovač mesiacov",show_month_separator:"Zobrazovať oddeľovač mesiacov",month_separator_width:"Šírka oddeľovača mesiacov",month_separator_color:"Farba oddeľovača mesiacov",event_display:"Zobrazenie udalosti",event_title:"Názov udalosti",event_font_size:"Veľkosť písma udalosti",empty_day_color:"Farba prázdneho dňa",time:"Čas",show_single_allday_time:"Zobrazovať čas pri celodenných udalostiach",show_end_time:"Zobrazovať čas skončenia",time_font_size:"Veľkosť písma času",time_color:"Farba času",time_icon_size:"Veľkosť ikony času",location:"Miesto",remove_location_country:"Odstrániť krajinu",location_font_size:"Veľkosť písma miesta",location_color:"Farba miesta",location_icon_size:"Veľkosť ikony miesta",custom_country_pattern:"Vzory krajín, ktoré budú odstránené",custom_country_pattern_note:"Zadajte mená krajín ako vzor regulárneho výrazu (napr. 'USA|Spojené štáty|Kanada'). V udalosti, ktorých miesta sa končia na ktorýkoľvek z týchto výrazov, sa odstráni krajina.",progress_indicators:"Ukazovateľ priebehu",show_countdown:"Zobraziť odpočítavanie",show_progress_bar:"Zobraziť lištu priebehu",progress_bar_color:"Farba lišty priebehu",progress_bar_height:"Výška lišty priebehu",progress_bar_width:"Šírka lišty priebehu",multiday_event_handling:"Spracovanie viacdenných udalostí",weather_integration:"Integrácia s počasím",weather_entity_position:"Entita počasia a umiestnenie",weather_entity:"Entita počasia",weather_position:"Umiestnenie počasia",date:"Dátum",event:"Udalosť",both:"Obe",date_column_weather:"Počasie v stĺpci s dátumom",show_conditions:"Zobraziť predpoveď",show_high_temp:"Zobraziť najvyššiu teplotu",show_low_temp:"Zobraziť najnižšiu teplotu",icon_size:"Veľkosť ikony",font_size:"Veľkosť písma",color:"Farba",event_row_weather:"Počasie v riadku s udalosťou",show_temp:"Zobraziť teplotu",interactions:"Interakcie",tap_action:"Akcia kliknutia",hold_action:"Akcia podržania",more_info:"Viac informácií",navigate:"Navigovať",url:"URL adresa",call_service:"Zavolať službu",expand:"Prepnúť kompaktný/rozšírený pohľad",navigation_path:"Cesta pre navigáciu",url_path:"URL adresa",service:"Služba",service_data:"Údaje pre službu (JSON)",refresh_settings:"Nastavenie obnovenia",refresh_interval:"Interval obnovenia (minúty)",refresh_on_navigate:"Obnoviť pri navigovaní späť",deprecated_config_detected:"Boli zistené zastarané možnosti konfigurácie.",deprecated_config_explanation:"Niektoré voľby vo vašej konfigurácií už nie sú podporované.",deprecated_config_update_hint:"Prosím, aktualizujte ich, aby ste tak zaistili kompatibilitu.",update_config:"Aktualizovať konfiguráciu…"}},sv:{daysOfWeek:["Sön","Mån","Tis","Ons","Tors","Fre","Lör"],fullDaysOfWeek:["Söndag","Måndag","Tisdag","Onsdag","Torsdag","Fredag","Lördag"],months:["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"],allDay:"heldag",multiDay:"till",at:"vid",endsToday:"slutar idag",endsTomorrow:"slutar imorgon",noEvents:"Inga kommande händelser",loading:"Laddar kalenderhändelser...",error:"Fel: Kalenderentiteten hittades inte eller är felaktigt konfigurerad.",editor:{calendar_entities:"Kalenderentiteter",calendar:"Kalender",entity_identification:"Entitetsidentifiering",entity:"Entitet",add_calendar:"Lägg till kalender",remove:"Ta bort",convert_to_advanced:"Konvertera till avancerat",simple:"Enkel",display_settings:"Visningsinställningar",label:"Etikett",label_type:"Etikettyp",none:"Ingen",text_emoji:"Text/Emoji",icon:"Ikon",text_value:"Textvärde",text_label_note:"Ange text eller emoji som '📅 Min Kalender'",image:"Bild",image_label_note:"Sökväg till bild, t.ex. /local/calendar.jpg",label_note:"Anpassad etikett för denna kalender.",colors:"Färger",event_color:"Händelsefärg",entity_color_note:"Anpassad färg för händelsetitlar från denna kalender.",accent_color:"Accentfärg",entity_accent_color_note:"Anpassad accentfärg för den vertikala linjen för händelser från denna kalender. Denna färg används även som bakgrundsfärg för händelsen när 'event_background_opacity' är >0.",event_filtering:"Händelsefiltrering",blocklist:"Blocklista",blocklist_note:"Lista med termer (avgränsade med |) att exkludera händelser. Händelser med titlar som innehåller någon av dessa termer döljs. Exempel: 'Privat|Möte|Konferens'",allowlist:"Tillåtlista",allowlist_note:"Lista med termer (avgränsade med |) att inkludera händelser. Om inte tom, visas endast händelser med titlar som innehåller någon av dessa termer. Exempel: 'Födelsedag|Jubileum|Viktigt'",entity_overrides:"Entitetsöverskridanden",entity_overrides_note:"Dessa inställningar åsidosätter de globala kärninställningarna för denna specifika kalender.",compact_events_to_show:"Kompakta händelser att visa",entity_compact_events_note:"Åsidosätt antal händelser att visa i kompakt läge för denna kalender.",show_time:"Visa tid",entity_show_time_note:"Visa eller dölj händelsetider endast för denna kalender.",show_location:"Visa plats",entity_show_location_note:"Visa eller dölj plats för händelser endast för denna kalender.",split_multiday_events:"Dela upp flerdagshändelser",entity_split_multiday_note:"Dela upp flerdagshändelser i individuella dagsegment för denna kalender.",core_settings:"Kärninställningar",time_range:"Tidsintervall",time_range_note:"Detta tidsintervall definierar det vanliga visningsläget, vilket blir det utökade läget om kompakt läge är konfigurerat.",days_to_show:"Dagar att visa",days_to_show_note:"Antal dagar att hämta från API och visa i kalendern",start_date:"Startdatum",start_date_mode:"Startdatoläge",start_date_mode_default:"Standard (idag)",start_date_mode_fixed:"Fast datum",start_date_mode_offset:"Relativt avstånd",start_date_fixed:"Fast startdatum",start_date_offset:"Relativt avstånd från idag",start_date_offset_note:"Ange ett positivt eller negativt tal för att justera från idag (t.ex. +1 för imorgon, -5 för fem dagar sedan).",compact_mode:"Kompakt läge",compact_mode_note:"Kompakt läge visar färre dagar och/eller händelser initialt. Kortet kan expandera till full vy med en tryckning eller hållning om det är konfigurerat med action: 'expand'.",compact_days_to_show:"Kompakta dagar att visa",compact_events_complete_days:"Kompletta dagar i kompakt läge",compact_events_complete_days_note:"När aktiverat, om minst en händelse från en dag visas, visas alla händelser från den dagen.",event_visibility:"Händelsevisning",show_past_events:"Visa tidigare händelser",show_empty_days:"Visa tomma dagar",filter_duplicates:"Filtrera dubbletter",language_time_formats:"Språk & tidsformat",language:"Språk",language_mode:"Språkläge",language_code:"Språkkod",language_code_note:"Ange en tvåställig språkkod (t.ex. 'sv', 'en', 'de')",time_24h:"Tidsformat",system:"Systemstandard",custom:"Anpassad","12h":"12-timmars","24h":"24-timmars",appearance_layout:"Utseende & Layout",title_styling:"Titelstil",title:"Titel",title_font_size:"Titelfontstorlek",title_color:"Titelfärg",card_styling:"Kortstil",background_color:"Bakgrundsfärg",height_mode:"Höjdläge",auto:"Automatisk höjd",fixed:"Fast höjd",maximum:"Maxhöjd",height_value:"Höjdvärde",fixed_height_note:"Kortet behåller alltid exakt denna höjd oavsett innehåll",max_height_note:"Kortet växer med innehållet upp till denna maxhöjd",event_styling:"Händelsestil",event_background_opacity:"Händelsebakgrundens opacitet",vertical_line_width:"Vertikal linjebredd",spacing_alignment:"Avstånd & Justering",day_spacing:"Dagavstånd",event_spacing:"Händelseavstånd",additional_card_spacing:"Ytterligare kortavstånd",date_display:"Datumvisning",vertical_alignment:"Vertikal justering",date_vertical_alignment:"Datum vertikal justering",date_formatting:"Datumformatering",top:"Topp",middle:"Mitten",bottom:"Botten",weekday_font:"Veckodagsfont",weekday_font_size:"Veckodagsfontstorlek",weekday_color:"Veckodagsfärg",day_font:"Dagfont",day_font_size:"Dagfontstorlek",day_color:"Dagfärg",month_font:"Månadsfont",show_month:"Visa månad",month_font_size:"Månadsfontstorlek",month_color:"Månadsfärg",weekend_highlighting:"Helgmarkering",weekend_weekday_color:"Helg veckodagsfärg",weekend_day_color:"Helg dagfärg",weekend_month_color:"Helg månadsfärg",today_highlighting:"Idag-markering",today_weekday_color:"Idag veckodagsfärg",today_day_color:"Idag dagfärg",today_month_color:"Idag månadsfärg",today_indicator:"Idag-indikator",dot:"Punkt",pulse:"Puls",glow:"Glöd",emoji:"Emoji",emoji_value:"Emoji",emoji_indicator_note:"Ange en enskild emoji, t.ex. 🗓️",image_path:"Bildsökväg",image_indicator_note:"Sökväg till bild, t.ex. /local/image.jpg",today_indicator_position:"Idag-indikatorns position",today_indicator_color:"Idag-indikatorns färg",today_indicator_size:"Idag-indikatorns storlek",week_numbers_separators:"Veckonummer & Avgränsare",week_numbers:"Veckonummer",first_day_of_week:"Första veckodagen",sunday:"Söndag",monday:"Måndag",show_week_numbers:"Visa veckonummer",week_number_note_iso:"ISO (Europa/Internationellt): Första veckan innehåller årets första torsdag. Ger konsekventa veckonummer mellan år (ISO 8601-standard).",week_number_note_simple:"Enkel (Nordamerika): Veckor räknas sekventiellt från 1 januari oavsett veckodag. Första veckan kan vara partiell. Mer intuitivt men mindre standardiserat.",show_current_week_number:"Visa aktuellt veckonummer",week_number_font_size:"Veckonummer fontstorlek",week_number_color:"Veckonummer färg",week_number_background_color:"Veckonummer bakgrundsfärg",day_separator:"Dagavgränsare",show_day_separator:"Visa dagavgränsare",day_separator_width:"Dagavgränsarbredd",day_separator_color:"Dagavgränsarfärg",week_separator:"Veckoavgränsare",show_week_separator:"Visa veckoavgränsare",week_separator_width:"Veckoavgränsarbredd",week_separator_color:"Veckoavgränsarfärg",month_separator:"Månadsavgränsare",show_month_separator:"Visa månadsavgränsare",month_separator_width:"Månadsavgränsarbredd",month_separator_color:"Månadsavgränsarfärg",event_display:"Händelsevisning",event_title:"Händelsetitel",event_font_size:"Händelsefontstorlek",empty_day_color:"Tom dag-färg",time:"Tid",show_single_allday_time:"Visa tid för heldagshändelser",show_end_time:"Visa sluttid",time_font_size:"Tidfontstorlek",time_color:"Tidfärg",time_icon_size:"Tidsikonstorlek",location:"Plats",remove_location_country:"Ta bort land från plats",location_font_size:"Platsfontstorlek",location_color:"Platsfärg",location_icon_size:"Platsikonstorlek",custom_country_pattern:"Landsmönster att ta bort",custom_country_pattern_note:"Ange länder som reguljära uttryck (t.ex. 'USA|Sverige|Norge'). Händelser med platser som slutar med dessa tas bort.",progress_indicators:"Förloppsindikatorer",show_countdown:"Visa nedräkning",show_progress_bar:"Visa förloppsindikator",progress_bar_color:"Förloppsindikator färg",progress_bar_height:"Förloppsindikator höjd",progress_bar_width:"Förloppsindikator bredd",multiday_event_handling:"Flerdagshändelsehantering",weather_integration:"Väderintegration",weather_entity_position:"Väderentitet & position",weather_entity:"Väderentitet",weather_position:"Väderposition",date:"Datum",event:"Händelse",both:"Båda",date_column_weather:"Datumkolumn väder",show_conditions:"Visa väderförhållanden",show_high_temp:"Visa högsta temperatur",show_low_temp:"Visa lägsta temperatur",icon_size:"Ikonstorlek",font_size:"Fontstorlek",color:"Färg",event_row_weather:"Händelserad väder",show_temp:"Visa temperatur",interactions:"Interaktioner",tap_action:"Tryckåtgärd",hold_action:"Hållåtgärd",more_info:"Mer info",navigate:"Navigera",url:"URL",call_service:"Anropa tjänst",expand:"Växla kompakt/utökat läge",navigation_path:"Navigeringssökväg",url_path:"URL",service:"Tjänst",service_data:"Tjänstdata (JSON)",refresh_settings:"Uppdateringsinställningar",refresh_interval:"Uppdateringsintervall (minuter)",refresh_on_navigate:"Uppdatera vid navigering tillbaka",deprecated_config_detected:"Föråldrade konfigurationsalternativ upptäckta.",deprecated_config_explanation:"Vissa alternativ i din konfiguration stöds inte längre.",deprecated_config_update_hint:"Uppdatera för att säkerställa kompatibilitet.",update_config:"Uppdatera konfiguration…"}},uk:{daysOfWeek:["Нд","Пн","Вт","Ср","Чт","Пт","Сб"],fullDaysOfWeek:["неділі","понеділка","вівторка","середи","четверга","п'ятниці","суботи"],months:["січ","лют","бер","кві","тра","чер","лип","сер","вер","жов","лис","гру"],allDay:"весь день",multiDay:"до",at:"об",endsToday:"закінчується сьогодні",endsTomorrow:"закінчується завтра",noEvents:"Немає майбутніх подій",loading:"Завантаження подій календаря...",error:"Помилка: Cутність календаря не знайдено або налаштовано неправильно"},vi:{daysOfWeek:["CN","T.2","T.3","T.4","T.5","T.6","T.7"],fullDaysOfWeek:["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"],months:["Th1","Th2","Th3","Th4","Th5","Th6","Th7","Th8","Th9","Th10","Th11","Th12"],allDay:"cả ngày",multiDay:"đến",at:"lúc",endsToday:"kết thúc hôm nay",endsTomorrow:"kết thúc ngày mai",noEvents:"Không có sự kiện sắp tới",loading:"Đang tải sự kiện...",error:"Lỗi: Không tìm thấy lịch hoặc cấu hình không đúng"},th:{daysOfWeek:["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."],fullDaysOfWeek:["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"],months:["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."],allDay:"ตลอดวัน",multiDay:"ถึง",at:"เวลา",endsToday:"สิ้นสุดวันนี้",endsTomorrow:"สิ้นสุดพรุ่งนี้",noEvents:"ไม่มีเหตุการณ์ที่กำลังจะเกิดขึ้น",loading:"กำลังโหลดเหตุการณ์ปฏิทิน...",error:"ข้อผิดพลาด: ไม่พบเอนทิตีปฏิทินหรือมีการตั้งค่าที่ไม่ถูกต้อง"},"zh-cn":{daysOfWeek:["日","一","二","三","四","五","六"],fullDaysOfWeek:["星期日","星期一","星期二","星期三","星期四","星期五","星期六"],months:["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"],allDay:"整天",multiDay:"直到",at:"在",endsToday:"今天结束",endsTomorrow:"明天结束",noEvents:"没有即将到来的活动",loading:"正在加载日历事件...",error:"错误：找不到日历实体或配置不正确"},"zh-tw":{daysOfWeek:["日","一","二","三","四","五","六"],fullDaysOfWeek:["星期日","星期一","星期二","星期三","星期四","星期五","星期六"],months:["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"],allDay:"整天",multiDay:"直到",at:"在",endsToday:"今天結束",endsTomorrow:"明天結束",noEvents:"沒有即將到來的活動",loading:"正在加載日曆事件...",error:"錯誤：找不到日曆實體或配置不正確"}},kt="en",bt=new Map;function Mt(e,t){const a=`${e||""}:${(null==t?void 0:t.language)||""}`;if(bt.has(a))return bt.get(a);let n;if(e&&""!==e.trim()){const t=e.toLowerCase();if(wt[t])return n=t,bt.set(a,n),n}if(null==t?void 0:t.language){const e=t.language.toLowerCase();if(wt[e])return n=e,bt.set(a,n),n;const i=e.split(/[-_]/)[0];if(i!==e&&wt[i])return n=i,bt.set(a,n),n}return n=kt,bt.set(a,n),n}function Tt(e){const t=(null==e?void 0:e.toLowerCase())||kt;return wt[t]||wt[kt]}function $t(e){const t=(null==e?void 0:e.toLowerCase())||"";return"de"===t||"hr"===t?"day-dot-month":"en"===t||"hu"===t?"month-day":"day-month"}function Dt(){return Math.random().toString(36).substring(2,15)}function St(e,t,a,n){const i=e.map((e=>"string"==typeof e?e:e.entity)).sort().join("_");let r="";if(n)try{r=n.includes("T")?n.split("T")[0]:n}catch(e){r=n}return function(e){let t=0;for(let a=0;a<e.length;a++){t=(t<<5)-t+e.charCodeAt(a),t|=0}return Math.abs(t).toString(36)}(`calendar_${i}_${t}_${a?1:0}${r?`_${r}`:""}`)}function xt(e,t=!0){if(!e)return t;if("24"===e.time_format)return!0;if("12"===e.time_format)return!1;if("language"===e.time_format&&e.language)return a(e.language);if("system"===e.time_format)try{const e=new Intl.DateTimeFormat(navigator.language,{hour:"numeric"});return!e.format(new Date(2e3,0,1,13,0,0)).match(/AM|PM|am|pm/)}catch(n){return e.language?a(e.language):t}return t;function a(e){const t=e.split("-")[0].toLowerCase();return["de","fr","es","it","pt","nl","ru","pl","sv","no","fi","da","cs","sk","sl","hr","hu","ro","bg","el","tr","zh","ja","ko"].includes(t)}}function Yt(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}function zt(e,t){if(!e||"object"!=typeof e||Array.isArray(e))return e;const a=Array.isArray(e)?[]:{};for(const[n,i]of Object.entries(e)){if(void 0===i)continue;if("show_week_numbers"===n&&(null===i||""===i))continue;if("entities"===n&&Array.isArray(i)){a[n]=i;continue}if("weather"===n&&"object"==typeof i&&null!==i){a[n]=structuredClone?structuredClone(i):JSON.parse(JSON.stringify(i));continue}if(!(t&&n in t&&t[n]===i))if(null===i||"object"!=typeof i||Array.isArray(i)||!t||"object"!=typeof t[n]||Array.isArray(t[n]))a[n]=i;else{const e=zt(i,t[n]);Object.keys(e).length>0&&(a[n]=e)}}return a}function Lt(e){return e&&e.__esModule&&Object.prototype.hasOwnProperty.call(e,"default")?e.default:e}var jt,Et={exports:{}};function Ct(){return jt||(jt=1,Et.exports=function(){var e=1e3,t=6e4,a=36e5,n="millisecond",i="second",r="minute",o="hour",s="day",l="week",d="month",_="quarter",c="year",h="date",u="Invalid Date",m=/^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/,g=/\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,p={name:"en",weekdays:"Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),months:"January_February_March_April_May_June_July_August_September_October_November_December".split("_"),ordinal:function(e){var t=["th","st","nd","rd"],a=e%100;return"["+e+(t[(a-20)%10]||t[a]||t[0])+"]"}},f=function(e,t,a){var n=String(e);return!n||n.length>=t?e:""+Array(t+1-n.length).join(a)+e},y={s:f,z:function(e){var t=-e.utcOffset(),a=Math.abs(t),n=Math.floor(a/60),i=a%60;return(t<=0?"+":"-")+f(n,2,"0")+":"+f(i,2,"0")},m:function e(t,a){if(t.date()<a.date())return-e(a,t);var n=12*(a.year()-t.year())+(a.month()-t.month()),i=t.clone().add(n,d),r=a-i<0,o=t.clone().add(n+(r?-1:1),d);return+(-(n+(a-i)/(r?i-o:o-i))||0)},a:function(e){return e<0?Math.ceil(e)||0:Math.floor(e)},p:function(e){return{M:d,y:c,w:l,d:s,D:h,h:o,m:r,s:i,ms:n,Q:_}[e]||String(e||"").toLowerCase().replace(/s$/,"")},u:function(e){return void 0===e}},v="en",w={};w[v]=p;var k="$isDayjsObject",b=function(e){return e instanceof D||!(!e||!e[k])},M=function e(t,a,n){var i;if(!t)return v;if("string"==typeof t){var r=t.toLowerCase();w[r]&&(i=r),a&&(w[r]=a,i=r);var o=t.split("-");if(!i&&o.length>1)return e(o[0])}else{var s=t.name;w[s]=t,i=s}return!n&&i&&(v=i),i||!n&&v},T=function(e,t){if(b(e))return e.clone();var a="object"==typeof t?t:{};return a.date=e,a.args=arguments,new D(a)},$=y;$.l=M,$.i=b,$.w=function(e,t){return T(e,{locale:t.$L,utc:t.$u,x:t.$x,$offset:t.$offset})};var D=function(){function p(e){this.$L=M(e.locale,null,!0),this.parse(e),this.$x=this.$x||e.x||{},this[k]=!0}var f=p.prototype;return f.parse=function(e){this.$d=function(e){var t=e.date,a=e.utc;if(null===t)return new Date(NaN);if($.u(t))return new Date;if(t instanceof Date)return new Date(t);if("string"==typeof t&&!/Z$/i.test(t)){var n=t.match(m);if(n){var i=n[2]-1||0,r=(n[7]||"0").substring(0,3);return a?new Date(Date.UTC(n[1],i,n[3]||1,n[4]||0,n[5]||0,n[6]||0,r)):new Date(n[1],i,n[3]||1,n[4]||0,n[5]||0,n[6]||0,r)}}return new Date(t)}(e),this.init()},f.init=function(){var e=this.$d;this.$y=e.getFullYear(),this.$M=e.getMonth(),this.$D=e.getDate(),this.$W=e.getDay(),this.$H=e.getHours(),this.$m=e.getMinutes(),this.$s=e.getSeconds(),this.$ms=e.getMilliseconds()},f.$utils=function(){return $},f.isValid=function(){return!(this.$d.toString()===u)},f.isSame=function(e,t){var a=T(e);return this.startOf(t)<=a&&a<=this.endOf(t)},f.isAfter=function(e,t){return T(e)<this.startOf(t)},f.isBefore=function(e,t){return this.endOf(t)<T(e)},f.$g=function(e,t,a){return $.u(e)?this[t]:this.set(a,e)},f.unix=function(){return Math.floor(this.valueOf()/1e3)},f.valueOf=function(){return this.$d.getTime()},f.startOf=function(e,t){var a=this,n=!!$.u(t)||t,_=$.p(e),u=function(e,t){var i=$.w(a.$u?Date.UTC(a.$y,t,e):new Date(a.$y,t,e),a);return n?i:i.endOf(s)},m=function(e,t){return $.w(a.toDate()[e].apply(a.toDate("s"),(n?[0,0,0,0]:[23,59,59,999]).slice(t)),a)},g=this.$W,p=this.$M,f=this.$D,y="set"+(this.$u?"UTC":"");switch(_){case c:return n?u(1,0):u(31,11);case d:return n?u(1,p):u(0,p+1);case l:var v=this.$locale().weekStart||0,w=(g<v?g+7:g)-v;return u(n?f-w:f+(6-w),p);case s:case h:return m(y+"Hours",0);case o:return m(y+"Minutes",1);case r:return m(y+"Seconds",2);case i:return m(y+"Milliseconds",3);default:return this.clone()}},f.endOf=function(e){return this.startOf(e,!1)},f.$set=function(e,t){var a,l=$.p(e),_="set"+(this.$u?"UTC":""),u=(a={},a[s]=_+"Date",a[h]=_+"Date",a[d]=_+"Month",a[c]=_+"FullYear",a[o]=_+"Hours",a[r]=_+"Minutes",a[i]=_+"Seconds",a[n]=_+"Milliseconds",a)[l],m=l===s?this.$D+(t-this.$W):t;if(l===d||l===c){var g=this.clone().set(h,1);g.$d[u](m),g.init(),this.$d=g.set(h,Math.min(this.$D,g.daysInMonth())).$d}else u&&this.$d[u](m);return this.init(),this},f.set=function(e,t){return this.clone().$set(e,t)},f.get=function(e){return this[$.p(e)]()},f.add=function(n,_){var h,u=this;n=Number(n);var m=$.p(_),g=function(e){var t=T(u);return $.w(t.date(t.date()+Math.round(e*n)),u)};if(m===d)return this.set(d,this.$M+n);if(m===c)return this.set(c,this.$y+n);if(m===s)return g(1);if(m===l)return g(7);var p=(h={},h[r]=t,h[o]=a,h[i]=e,h)[m]||1,f=this.$d.getTime()+n*p;return $.w(f,this)},f.subtract=function(e,t){return this.add(-1*e,t)},f.format=function(e){var t=this,a=this.$locale();if(!this.isValid())return a.invalidDate||u;var n=e||"YYYY-MM-DDTHH:mm:ssZ",i=$.z(this),r=this.$H,o=this.$m,s=this.$M,l=a.weekdays,d=a.months,_=a.meridiem,c=function(e,a,i,r){return e&&(e[a]||e(t,n))||i[a].slice(0,r)},h=function(e){return $.s(r%12||12,e,"0")},m=_||function(e,t,a){var n=e<12?"AM":"PM";return a?n.toLowerCase():n};return n.replace(g,(function(e,n){return n||function(e){switch(e){case"YY":return String(t.$y).slice(-2);case"YYYY":return $.s(t.$y,4,"0");case"M":return s+1;case"MM":return $.s(s+1,2,"0");case"MMM":return c(a.monthsShort,s,d,3);case"MMMM":return c(d,s);case"D":return t.$D;case"DD":return $.s(t.$D,2,"0");case"d":return String(t.$W);case"dd":return c(a.weekdaysMin,t.$W,l,2);case"ddd":return c(a.weekdaysShort,t.$W,l,3);case"dddd":return l[t.$W];case"H":return String(r);case"HH":return $.s(r,2,"0");case"h":return h(1);case"hh":return h(2);case"a":return m(r,o,!0);case"A":return m(r,o,!1);case"m":return String(o);case"mm":return $.s(o,2,"0");case"s":return String(t.$s);case"ss":return $.s(t.$s,2,"0");case"SSS":return $.s(t.$ms,3,"0");case"Z":return i}return null}(e)||i.replace(":","")}))},f.utcOffset=function(){return 15*-Math.round(this.$d.getTimezoneOffset()/15)},f.diff=function(n,h,u){var m,g=this,p=$.p(h),f=T(n),y=(f.utcOffset()-this.utcOffset())*t,v=this-f,w=function(){return $.m(g,f)};switch(p){case c:m=w()/12;break;case d:m=w();break;case _:m=w()/3;break;case l:m=(v-y)/6048e5;break;case s:m=(v-y)/864e5;break;case o:m=v/a;break;case r:m=v/t;break;case i:m=v/e;break;default:m=v}return u?m:$.a(m)},f.daysInMonth=function(){return this.endOf(d).$D},f.$locale=function(){return w[this.$L]},f.locale=function(e,t){if(!e)return this.$L;var a=this.clone(),n=M(e,t,!0);return n&&(a.$L=n),a},f.clone=function(){return $.w(this.$d,this)},f.toDate=function(){return new Date(this.valueOf())},f.toJSON=function(){return this.isValid()?this.toISOString():null},f.toISOString=function(){return this.$d.toISOString()},f.toString=function(){return this.$d.toUTCString()},p}(),S=D.prototype;return T.prototype=S,[["$ms",n],["$s",i],["$m",r],["$H",o],["$W",s],["$M",d],["$y",c],["$D",h]].forEach((function(e){S[e[1]]=function(t){return this.$g(t,e[0],e[1])}})),T.extend=function(e,t){return e.$i||(e(t,D,T),e.$i=!0),T},T.locale=M,T.isDayjs=b,T.unix=function(e){return T(1e3*e)},T.en=w[v],T.Ls=w,T.p={},T}()),Et.exports}var Ht,Ft=Lt(Ct()),Vt={exports:{}};var Ot,At=(Ht||(Ht=1,Vt.exports=function(e,t,a){e=e||{};var n=t.prototype,i={future:"in %s",past:"%s ago",s:"a few seconds",m:"a minute",mm:"%d minutes",h:"an hour",hh:"%d hours",d:"a day",dd:"%d days",M:"a month",MM:"%d months",y:"a year",yy:"%d years"};function r(e,t,a,i){return n.fromToBase(e,t,a,i)}a.en.relativeTime=i,n.fromToBase=function(t,n,r,o,s){for(var l,d,_,c=r.$locale().relativeTime||i,h=e.thresholds||[{l:"s",r:44,d:"second"},{l:"m",r:89},{l:"mm",r:44,d:"minute"},{l:"h",r:89},{l:"hh",r:21,d:"hour"},{l:"d",r:35},{l:"dd",r:25,d:"day"},{l:"M",r:45},{l:"MM",r:10,d:"month"},{l:"y",r:17},{l:"yy",d:"year"}],u=h.length,m=0;m<u;m+=1){var g=h[m];g.d&&(l=o?a(t).diff(r,g.d,!0):r.diff(t,g.d,!0));var p=(e.rounding||Math.round)(Math.abs(l));if(_=l>0,p<=g.r||!g.r){p<=1&&m>0&&(g=h[m-1]);var f=c[g.l];s&&(p=s(""+p)),d="string"==typeof f?f.replace("%d",p):f(p,n,g.l,_);break}}if(n)return d;var y=_?c.future:c.past;return"function"==typeof y?y(d):y.replace("%s",d)},n.to=function(e,t){return r(e,t,this,!0)},n.from=function(e,t){return r(e,t,this)};var o=function(e){return e.$u?a.utc():a()};n.toNow=function(e){return this.to(o(this),e)},n.fromNow=function(e){return this.from(o(this),e)}}),Vt.exports),Pt=Lt(At),It={exports:{}};Ot||(Ot=1,It.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"bg",weekdays:"неделя_понеделник_вторник_сряда_четвъртък_петък_събота".split("_"),weekdaysShort:"нед_пон_вто_сря_чет_пет_съб".split("_"),weekdaysMin:"нд_пн_вт_ср_чт_пт_сб".split("_"),months:"януари_февруари_март_април_май_юни_юли_август_септември_октомври_ноември_декември".split("_"),monthsShort:"яну_фев_мар_апр_май_юни_юли_авг_сеп_окт_ное_дек".split("_"),weekStart:1,ordinal:function(e){var t=e%100;if(t>10&&t<20)return e+"-ти";var a=e%10;return 1===a?e+"-ви":2===a?e+"-ри":7===a||8===a?e+"-ми":e+"-ти"},formats:{LT:"H:mm",LTS:"H:mm:ss",L:"D.MM.YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY H:mm",LLLL:"dddd, D MMMM YYYY H:mm"},relativeTime:{future:"след %s",past:"преди %s",s:"няколко секунди",m:"минута",mm:"%d минути",h:"час",hh:"%d часа",d:"ден",dd:"%d дена",M:"месец",MM:"%d месеца",y:"година",yy:"%d години"}};return a.default.locale(n,null,!0),n}(Ct()));var Nt,Wt={exports:{}};Nt||(Nt=1,Wt.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"ca",weekdays:"Diumenge_Dilluns_Dimarts_Dimecres_Dijous_Divendres_Dissabte".split("_"),weekdaysShort:"Dg._Dl._Dt._Dc._Dj._Dv._Ds.".split("_"),weekdaysMin:"Dg_Dl_Dt_Dc_Dj_Dv_Ds".split("_"),months:"Gener_Febrer_Març_Abril_Maig_Juny_Juliol_Agost_Setembre_Octubre_Novembre_Desembre".split("_"),monthsShort:"Gen._Febr._Març_Abr._Maig_Juny_Jul._Ag._Set._Oct._Nov._Des.".split("_"),weekStart:1,formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD/MM/YYYY",LL:"D MMMM [de] YYYY",LLL:"D MMMM [de] YYYY [a les] H:mm",LLLL:"dddd D MMMM [de] YYYY [a les] H:mm",ll:"D MMM YYYY",lll:"D MMM YYYY, H:mm",llll:"ddd D MMM YYYY, H:mm"},relativeTime:{future:"d'aquí %s",past:"fa %s",s:"uns segons",m:"un minut",mm:"%d minuts",h:"una hora",hh:"%d hores",d:"un dia",dd:"%d dies",M:"un mes",MM:"%d mesos",y:"un any",yy:"%d anys"},ordinal:function(e){return e+(1===e||3===e?"r":2===e?"n":4===e?"t":"è")}};return a.default.locale(n,null,!0),n}(Ct()));var Ut,Bt={exports:{}};Ut||(Ut=1,Bt.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e);function n(e){return e>1&&e<5&&1!=~~(e/10)}function i(e,t,a,i){var r=e+" ";switch(a){case"s":return t||i?"pár sekund":"pár sekundami";case"m":return t?"minuta":i?"minutu":"minutou";case"mm":return t||i?r+(n(e)?"minuty":"minut"):r+"minutami";case"h":return t?"hodina":i?"hodinu":"hodinou";case"hh":return t||i?r+(n(e)?"hodiny":"hodin"):r+"hodinami";case"d":return t||i?"den":"dnem";case"dd":return t||i?r+(n(e)?"dny":"dní"):r+"dny";case"M":return t||i?"měsíc":"měsícem";case"MM":return t||i?r+(n(e)?"měsíce":"měsíců"):r+"měsíci";case"y":return t||i?"rok":"rokem";case"yy":return t||i?r+(n(e)?"roky":"let"):r+"lety"}}var r={name:"cs",weekdays:"neděle_pondělí_úterý_středa_čtvrtek_pátek_sobota".split("_"),weekdaysShort:"ne_po_út_st_čt_pá_so".split("_"),weekdaysMin:"ne_po_út_st_čt_pá_so".split("_"),months:"leden_únor_březen_duben_květen_červen_červenec_srpen_září_říjen_listopad_prosinec".split("_"),monthsShort:"led_úno_bře_dub_kvě_čvn_čvc_srp_zář_říj_lis_pro".split("_"),weekStart:1,yearStart:4,ordinal:function(e){return e+"."},formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY H:mm",LLLL:"dddd D. MMMM YYYY H:mm",l:"D. M. YYYY"},relativeTime:{future:"za %s",past:"před %s",s:i,m:i,mm:i,h:i,hh:i,d:i,dd:i,M:i,MM:i,y:i,yy:i}};return a.default.locale(r,null,!0),r}(Ct()));var Rt,Kt={exports:{}};Rt||(Rt=1,Kt.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"da",weekdays:"søndag_mandag_tirsdag_onsdag_torsdag_fredag_lørdag".split("_"),weekdaysShort:"søn._man._tirs._ons._tors._fre._lør.".split("_"),weekdaysMin:"sø._ma._ti._on._to._fr._lø.".split("_"),months:"januar_februar_marts_april_maj_juni_juli_august_september_oktober_november_december".split("_"),monthsShort:"jan._feb._mar._apr._maj_juni_juli_aug._sept._okt._nov._dec.".split("_"),weekStart:1,yearStart:4,ordinal:function(e){return e+"."},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY HH:mm",LLLL:"dddd [d.] D. MMMM YYYY [kl.] HH:mm"},relativeTime:{future:"om %s",past:"%s siden",s:"få sekunder",m:"et minut",mm:"%d minutter",h:"en time",hh:"%d timer",d:"en dag",dd:"%d dage",M:"en måned",MM:"%d måneder",y:"et år",yy:"%d år"}};return a.default.locale(n,null,!0),n}(Ct()));var Jt,Zt={exports:{}};Jt||(Jt=1,Zt.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={s:"ein paar Sekunden",m:["eine Minute","einer Minute"],mm:"%d Minuten",h:["eine Stunde","einer Stunde"],hh:"%d Stunden",d:["ein Tag","einem Tag"],dd:["%d Tage","%d Tagen"],M:["ein Monat","einem Monat"],MM:["%d Monate","%d Monaten"],y:["ein Jahr","einem Jahr"],yy:["%d Jahre","%d Jahren"]};function i(e,t,a){var i=n[a];return Array.isArray(i)&&(i=i[t?0:1]),i.replace("%d",e)}var r={name:"de",weekdays:"Sonntag_Montag_Dienstag_Mittwoch_Donnerstag_Freitag_Samstag".split("_"),weekdaysShort:"So._Mo._Di._Mi._Do._Fr._Sa.".split("_"),weekdaysMin:"So_Mo_Di_Mi_Do_Fr_Sa".split("_"),months:"Januar_Februar_März_April_Mai_Juni_Juli_August_September_Oktober_November_Dezember".split("_"),monthsShort:"Jan._Feb._März_Apr._Mai_Juni_Juli_Aug._Sept._Okt._Nov._Dez.".split("_"),ordinal:function(e){return e+"."},weekStart:1,yearStart:4,formats:{LTS:"HH:mm:ss",LT:"HH:mm",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY HH:mm",LLLL:"dddd, D. MMMM YYYY HH:mm"},relativeTime:{future:"in %s",past:"vor %s",s:i,m:i,mm:i,h:i,hh:i,d:i,dd:i,M:i,MM:i,y:i,yy:i}};return a.default.locale(r,null,!0),r}(Ct()));var qt,Gt={exports:{}};qt||(qt=1,Gt.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"el",weekdays:"Κυριακή_Δευτέρα_Τρίτη_Τετάρτη_Πέμπτη_Παρασκευή_Σάββατο".split("_"),weekdaysShort:"Κυρ_Δευ_Τρι_Τετ_Πεμ_Παρ_Σαβ".split("_"),weekdaysMin:"Κυ_Δε_Τρ_Τε_Πε_Πα_Σα".split("_"),months:"Ιανουάριος_Φεβρουάριος_Μάρτιος_Απρίλιος_Μάιος_Ιούνιος_Ιούλιος_Αύγουστος_Σεπτέμβριος_Οκτώβριος_Νοέμβριος_Δεκέμβριος".split("_"),monthsShort:"Ιαν_Φεβ_Μαρ_Απρ_Μαι_Ιουν_Ιουλ_Αυγ_Σεπτ_Οκτ_Νοε_Δεκ".split("_"),ordinal:function(e){return e},weekStart:1,relativeTime:{future:"σε %s",past:"πριν %s",s:"μερικά δευτερόλεπτα",m:"ένα λεπτό",mm:"%d λεπτά",h:"μία ώρα",hh:"%d ώρες",d:"μία μέρα",dd:"%d μέρες",M:"ένα μήνα",MM:"%d μήνες",y:"ένα χρόνο",yy:"%d χρόνια"},formats:{LT:"h:mm A",LTS:"h:mm:ss A",L:"DD/MM/YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY h:mm A",LLLL:"dddd, D MMMM YYYY h:mm A"}};return a.default.locale(n,null,!0),n}(Ct()));var Qt,Xt={exports:{}};Qt||(Qt=1,Xt.exports={name:"en",weekdays:"Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),months:"January_February_March_April_May_June_July_August_September_October_November_December".split("_"),ordinal:function(e){var t=["th","st","nd","rd"],a=e%100;return"["+e+(t[(a-20)%10]||t[a]||t[0])+"]"}});var ea,ta={exports:{}};ea||(ea=1,ta.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"es",monthsShort:"ene_feb_mar_abr_may_jun_jul_ago_sep_oct_nov_dic".split("_"),weekdays:"domingo_lunes_martes_miércoles_jueves_viernes_sábado".split("_"),weekdaysShort:"dom._lun._mar._mié._jue._vie._sáb.".split("_"),weekdaysMin:"do_lu_ma_mi_ju_vi_sá".split("_"),months:"enero_febrero_marzo_abril_mayo_junio_julio_agosto_septiembre_octubre_noviembre_diciembre".split("_"),weekStart:1,formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD/MM/YYYY",LL:"D [de] MMMM [de] YYYY",LLL:"D [de] MMMM [de] YYYY H:mm",LLLL:"dddd, D [de] MMMM [de] YYYY H:mm"},relativeTime:{future:"en %s",past:"hace %s",s:"unos segundos",m:"un minuto",mm:"%d minutos",h:"una hora",hh:"%d horas",d:"un día",dd:"%d días",M:"un mes",MM:"%d meses",y:"un año",yy:"%d años"},ordinal:function(e){return e+"º"}};return a.default.locale(n,null,!0),n}(Ct()));var aa,na={exports:{}};aa||(aa=1,na.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e);function n(e,t,a,n){var i={s:"muutama sekunti",m:"minuutti",mm:"%d minuuttia",h:"tunti",hh:"%d tuntia",d:"päivä",dd:"%d päivää",M:"kuukausi",MM:"%d kuukautta",y:"vuosi",yy:"%d vuotta",numbers:"nolla_yksi_kaksi_kolme_neljä_viisi_kuusi_seitsemän_kahdeksan_yhdeksän".split("_")},r={s:"muutaman sekunnin",m:"minuutin",mm:"%d minuutin",h:"tunnin",hh:"%d tunnin",d:"päivän",dd:"%d päivän",M:"kuukauden",MM:"%d kuukauden",y:"vuoden",yy:"%d vuoden",numbers:"nollan_yhden_kahden_kolmen_neljän_viiden_kuuden_seitsemän_kahdeksan_yhdeksän".split("_")},o=n&&!t?r:i,s=o[a];return e<10?s.replace("%d",o.numbers[e]):s.replace("%d",e)}var i={name:"fi",weekdays:"sunnuntai_maanantai_tiistai_keskiviikko_torstai_perjantai_lauantai".split("_"),weekdaysShort:"su_ma_ti_ke_to_pe_la".split("_"),weekdaysMin:"su_ma_ti_ke_to_pe_la".split("_"),months:"tammikuu_helmikuu_maaliskuu_huhtikuu_toukokuu_kesäkuu_heinäkuu_elokuu_syyskuu_lokakuu_marraskuu_joulukuu".split("_"),monthsShort:"tammi_helmi_maalis_huhti_touko_kesä_heinä_elo_syys_loka_marras_joulu".split("_"),ordinal:function(e){return e+"."},weekStart:1,yearStart:4,relativeTime:{future:"%s päästä",past:"%s sitten",s:n,m:n,mm:n,h:n,hh:n,d:n,dd:n,M:n,MM:n,y:n,yy:n},formats:{LT:"HH.mm",LTS:"HH.mm.ss",L:"DD.MM.YYYY",LL:"D. MMMM[ta] YYYY",LLL:"D. MMMM[ta] YYYY, [klo] HH.mm",LLLL:"dddd, D. MMMM[ta] YYYY, [klo] HH.mm",l:"D.M.YYYY",ll:"D. MMM YYYY",lll:"D. MMM YYYY, [klo] HH.mm",llll:"ddd, D. MMM YYYY, [klo] HH.mm"}};return a.default.locale(i,null,!0),i}(Ct()));var ia,ra={exports:{}};ia||(ia=1,ra.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"fr",weekdays:"dimanche_lundi_mardi_mercredi_jeudi_vendredi_samedi".split("_"),weekdaysShort:"dim._lun._mar._mer._jeu._ven._sam.".split("_"),weekdaysMin:"di_lu_ma_me_je_ve_sa".split("_"),months:"janvier_février_mars_avril_mai_juin_juillet_août_septembre_octobre_novembre_décembre".split("_"),monthsShort:"janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.".split("_"),weekStart:1,yearStart:4,formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD/MM/YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY HH:mm",LLLL:"dddd D MMMM YYYY HH:mm"},relativeTime:{future:"dans %s",past:"il y a %s",s:"quelques secondes",m:"une minute",mm:"%d minutes",h:"une heure",hh:"%d heures",d:"un jour",dd:"%d jours",M:"un mois",MM:"%d mois",y:"un an",yy:"%d ans"},ordinal:function(e){return e+(1===e?"er":"")}};return a.default.locale(n,null,!0),n}(Ct()));var oa,sa={exports:{}};oa||(oa=1,sa.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={s:"מספר שניות",ss:"%d שניות",m:"דקה",mm:"%d דקות",h:"שעה",hh:"%d שעות",hh2:"שעתיים",d:"יום",dd:"%d ימים",dd2:"יומיים",M:"חודש",MM:"%d חודשים",MM2:"חודשיים",y:"שנה",yy:"%d שנים",yy2:"שנתיים"};function i(e,t,a){return(n[a+(2===e?"2":"")]||n[a]).replace("%d",e)}var r={name:"he",weekdays:"ראשון_שני_שלישי_רביעי_חמישי_שישי_שבת".split("_"),weekdaysShort:"א׳_ב׳_ג׳_ד׳_ה׳_ו׳_ש׳".split("_"),weekdaysMin:"א׳_ב׳_ג׳_ד׳_ה׳_ו_ש׳".split("_"),months:"ינואר_פברואר_מרץ_אפריל_מאי_יוני_יולי_אוגוסט_ספטמבר_אוקטובר_נובמבר_דצמבר".split("_"),monthsShort:"ינו_פבר_מרץ_אפר_מאי_יונ_יול_אוג_ספט_אוק_נוב_דצמ".split("_"),relativeTime:{future:"בעוד %s",past:"לפני %s",s:i,m:i,mm:i,h:i,hh:i,d:i,dd:i,M:i,MM:i,y:i,yy:i},ordinal:function(e){return e},format:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD/MM/YYYY",LL:"D [ב]MMMM YYYY",LLL:"D [ב]MMMM YYYY HH:mm",LLLL:"dddd, D [ב]MMMM YYYY HH:mm",l:"D/M/YYYY",ll:"D MMM YYYY",lll:"D MMM YYYY HH:mm",llll:"ddd, D MMM YYYY HH:mm"},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD/MM/YYYY",LL:"D [ב]MMMM YYYY",LLL:"D [ב]MMMM YYYY HH:mm",LLLL:"dddd, D [ב]MMMM YYYY HH:mm",l:"D/M/YYYY",ll:"D MMM YYYY",lll:"D MMM YYYY HH:mm",llll:"ddd, D MMM YYYY HH:mm"}};return a.default.locale(r,null,!0),r}(Ct()));var la,da={exports:{}};la||(la=1,da.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n="siječnja_veljače_ožujka_travnja_svibnja_lipnja_srpnja_kolovoza_rujna_listopada_studenoga_prosinca".split("_"),i="siječanj_veljača_ožujak_travanj_svibanj_lipanj_srpanj_kolovoz_rujan_listopad_studeni_prosinac".split("_"),r=/D[oD]?(\[[^[\]]*\]|\s)+MMMM?/,o=function(e,t){return r.test(t)?n[e.month()]:i[e.month()]};o.s=i,o.f=n;var s={name:"hr",weekdays:"nedjelja_ponedjeljak_utorak_srijeda_četvrtak_petak_subota".split("_"),weekdaysShort:"ned._pon._uto._sri._čet._pet._sub.".split("_"),weekdaysMin:"ne_po_ut_sr_če_pe_su".split("_"),months:o,monthsShort:"sij._velj._ožu._tra._svi._lip._srp._kol._ruj._lis._stu._pro.".split("_"),weekStart:1,formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY H:mm",LLLL:"dddd, D. MMMM YYYY H:mm"},relativeTime:{future:"za %s",past:"prije %s",s:"sekunda",m:"minuta",mm:"%d minuta",h:"sat",hh:"%d sati",d:"dan",dd:"%d dana",M:"mjesec",MM:"%d mjeseci",y:"godina",yy:"%d godine"},ordinal:function(e){return e+"."}};return a.default.locale(s,null,!0),s}(Ct()));var _a,ca={exports:{}};_a||(_a=1,ca.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"hu",weekdays:"vasárnap_hétfő_kedd_szerda_csütörtök_péntek_szombat".split("_"),weekdaysShort:"vas_hét_kedd_sze_csüt_pén_szo".split("_"),weekdaysMin:"v_h_k_sze_cs_p_szo".split("_"),months:"január_február_március_április_május_június_július_augusztus_szeptember_október_november_december".split("_"),monthsShort:"jan_feb_márc_ápr_máj_jún_júl_aug_szept_okt_nov_dec".split("_"),ordinal:function(e){return e+"."},weekStart:1,relativeTime:{future:"%s múlva",past:"%s",s:function(e,t,a,n){return"néhány másodperc"+(n||t?"":"e")},m:function(e,t,a,n){return"egy perc"+(n||t?"":"e")},mm:function(e,t,a,n){return e+" perc"+(n||t?"":"e")},h:function(e,t,a,n){return"egy "+(n||t?"óra":"órája")},hh:function(e,t,a,n){return e+" "+(n||t?"óra":"órája")},d:function(e,t,a,n){return"egy "+(n||t?"nap":"napja")},dd:function(e,t,a,n){return e+" "+(n||t?"nap":"napja")},M:function(e,t,a,n){return"egy "+(n||t?"hónap":"hónapja")},MM:function(e,t,a,n){return e+" "+(n||t?"hónap":"hónapja")},y:function(e,t,a,n){return"egy "+(n||t?"év":"éve")},yy:function(e,t,a,n){return e+" "+(n||t?"év":"éve")}},formats:{LT:"H:mm",LTS:"H:mm:ss",L:"YYYY.MM.DD.",LL:"YYYY. MMMM D.",LLL:"YYYY. MMMM D. H:mm",LLLL:"YYYY. MMMM D., dddd H:mm"}};return a.default.locale(n,null,!0),n}(Ct()));var ha,ua={exports:{}};ha||(ha=1,ua.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={s:["nokkrar sekúndur","nokkrar sekúndur","nokkrum sekúndum"],m:["mínúta","mínútu","mínútu"],mm:["mínútur","mínútur","mínútum"],h:["klukkustund","klukkustund","klukkustund"],hh:["klukkustundir","klukkustundir","klukkustundum"],d:["dagur","dag","degi"],dd:["dagar","daga","dögum"],M:["mánuður","mánuð","mánuði"],MM:["mánuðir","mánuði","mánuðum"],y:["ár","ár","ári"],yy:["ár","ár","árum"]};function i(e,t,a,i){var r=function(e,t,a,i){var r=i?0:a?1:2,o=2===e.length&&t%10==1?e[0]:e,s=n[o][r];return 1===e.length?s:"%d "+s}(a,e,i,t);return r.replace("%d",e)}var r={name:"is",weekdays:"sunnudagur_mánudagur_þriðjudagur_miðvikudagur_fimmtudagur_föstudagur_laugardagur".split("_"),months:"janúar_febrúar_mars_apríl_maí_júní_júlí_ágúst_september_október_nóvember_desember".split("_"),weekStart:1,weekdaysShort:"sun_mán_þri_mið_fim_fös_lau".split("_"),monthsShort:"jan_feb_mar_apr_maí_jún_júl_ágú_sep_okt_nóv_des".split("_"),weekdaysMin:"Su_Má_Þr_Mi_Fi_Fö_La".split("_"),ordinal:function(e){return e},formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY [kl.] H:mm",LLLL:"dddd, D. MMMM YYYY [kl.] H:mm"},relativeTime:{future:"eftir %s",past:"fyrir %s síðan",s:i,m:i,mm:i,h:i,hh:i,d:i,dd:i,M:i,MM:i,y:i,yy:i}};return a.default.locale(r,null,!0),r}(Ct()));var ma,ga={exports:{}};ma||(ma=1,ga.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"it",weekdays:"domenica_lunedì_martedì_mercoledì_giovedì_venerdì_sabato".split("_"),weekdaysShort:"dom_lun_mar_mer_gio_ven_sab".split("_"),weekdaysMin:"do_lu_ma_me_gi_ve_sa".split("_"),months:"gennaio_febbraio_marzo_aprile_maggio_giugno_luglio_agosto_settembre_ottobre_novembre_dicembre".split("_"),weekStart:1,monthsShort:"gen_feb_mar_apr_mag_giu_lug_ago_set_ott_nov_dic".split("_"),formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD/MM/YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY HH:mm",LLLL:"dddd D MMMM YYYY HH:mm"},relativeTime:{future:"tra %s",past:"%s fa",s:"qualche secondo",m:"un minuto",mm:"%d minuti",h:"un' ora",hh:"%d ore",d:"un giorno",dd:"%d giorni",M:"un mese",MM:"%d mesi",y:"un anno",yy:"%d anni"},ordinal:function(e){return e+"º"}};return a.default.locale(n,null,!0),n}(Ct()));var pa,fa={exports:{}};pa||(pa=1,fa.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"nb",weekdays:"søndag_mandag_tirsdag_onsdag_torsdag_fredag_lørdag".split("_"),weekdaysShort:"sø._ma._ti._on._to._fr._lø.".split("_"),weekdaysMin:"sø_ma_ti_on_to_fr_lø".split("_"),months:"januar_februar_mars_april_mai_juni_juli_august_september_oktober_november_desember".split("_"),monthsShort:"jan._feb._mars_april_mai_juni_juli_aug._sep._okt._nov._des.".split("_"),ordinal:function(e){return e+"."},weekStart:1,yearStart:4,formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY [kl.] HH:mm",LLLL:"dddd D. MMMM YYYY [kl.] HH:mm"},relativeTime:{future:"om %s",past:"%s siden",s:"noen sekunder",m:"ett minutt",mm:"%d minutter",h:"en time",hh:"%d timer",d:"en dag",dd:"%d dager",M:"en måned",MM:"%d måneder",y:"ett år",yy:"%d år"}};return a.default.locale(n,null,!0),n}(Ct()));var ya,va={exports:{}};ya||(ya=1,va.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"nl",weekdays:"zondag_maandag_dinsdag_woensdag_donderdag_vrijdag_zaterdag".split("_"),weekdaysShort:"zo._ma._di._wo._do._vr._za.".split("_"),weekdaysMin:"zo_ma_di_wo_do_vr_za".split("_"),months:"januari_februari_maart_april_mei_juni_juli_augustus_september_oktober_november_december".split("_"),monthsShort:"jan_feb_mrt_apr_mei_jun_jul_aug_sep_okt_nov_dec".split("_"),ordinal:function(e){return"["+e+(1===e||8===e||e>=20?"ste":"de")+"]"},weekStart:1,yearStart:4,formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD-MM-YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY HH:mm",LLLL:"dddd D MMMM YYYY HH:mm"},relativeTime:{future:"over %s",past:"%s geleden",s:"een paar seconden",m:"een minuut",mm:"%d minuten",h:"een uur",hh:"%d uur",d:"een dag",dd:"%d dagen",M:"een maand",MM:"%d maanden",y:"een jaar",yy:"%d jaar"}};return a.default.locale(n,null,!0),n}(Ct()));var wa,ka={exports:{}};wa||(wa=1,ka.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"nn",weekdays:"sundag_måndag_tysdag_onsdag_torsdag_fredag_laurdag".split("_"),weekdaysShort:"sun_mån_tys_ons_tor_fre_lau".split("_"),weekdaysMin:"su_må_ty_on_to_fr_la".split("_"),months:"januar_februar_mars_april_mai_juni_juli_august_september_oktober_november_desember".split("_"),monthsShort:"jan_feb_mar_apr_mai_jun_jul_aug_sep_okt_nov_des".split("_"),ordinal:function(e){return e+"."},weekStart:1,relativeTime:{future:"om %s",past:"for %s sidan",s:"nokre sekund",m:"eitt minutt",mm:"%d minutt",h:"ein time",hh:"%d timar",d:"ein dag",dd:"%d dagar",M:"ein månad",MM:"%d månadar",y:"eitt år",yy:"%d år"},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY [kl.] H:mm",LLLL:"dddd D. MMMM YYYY [kl.] HH:mm"}};return a.default.locale(n,null,!0),n}(Ct()));var ba,Ma={exports:{}};ba||(ba=1,Ma.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e);function n(e){return e%10<5&&e%10>1&&~~(e/10)%10!=1}function i(e,t,a){var i=e+" ";switch(a){case"m":return t?"minuta":"minutę";case"mm":return i+(n(e)?"minuty":"minut");case"h":return t?"godzina":"godzinę";case"hh":return i+(n(e)?"godziny":"godzin");case"MM":return i+(n(e)?"miesiące":"miesięcy");case"yy":return i+(n(e)?"lata":"lat")}}var r="stycznia_lutego_marca_kwietnia_maja_czerwca_lipca_sierpnia_września_października_listopada_grudnia".split("_"),o="styczeń_luty_marzec_kwiecień_maj_czerwiec_lipiec_sierpień_wrzesień_październik_listopad_grudzień".split("_"),s=/D MMMM/,l=function(e,t){return s.test(t)?r[e.month()]:o[e.month()]};l.s=o,l.f=r;var d={name:"pl",weekdays:"niedziela_poniedziałek_wtorek_środa_czwartek_piątek_sobota".split("_"),weekdaysShort:"ndz_pon_wt_śr_czw_pt_sob".split("_"),weekdaysMin:"Nd_Pn_Wt_Śr_Cz_Pt_So".split("_"),months:l,monthsShort:"sty_lut_mar_kwi_maj_cze_lip_sie_wrz_paź_lis_gru".split("_"),ordinal:function(e){return e+"."},weekStart:1,yearStart:4,relativeTime:{future:"za %s",past:"%s temu",s:"kilka sekund",m:i,mm:i,h:i,hh:i,d:"1 dzień",dd:"%d dni",M:"miesiąc",MM:i,y:"rok",yy:i},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD.MM.YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY HH:mm",LLLL:"dddd, D MMMM YYYY HH:mm"}};return a.default.locale(d,null,!0),d}(Ct()));var Ta,$a={exports:{}};Ta||(Ta=1,$a.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"pt",weekdays:"domingo_segunda-feira_terça-feira_quarta-feira_quinta-feira_sexta-feira_sábado".split("_"),weekdaysShort:"dom_seg_ter_qua_qui_sex_sab".split("_"),weekdaysMin:"Do_2ª_3ª_4ª_5ª_6ª_Sa".split("_"),months:"janeiro_fevereiro_março_abril_maio_junho_julho_agosto_setembro_outubro_novembro_dezembro".split("_"),monthsShort:"jan_fev_mar_abr_mai_jun_jul_ago_set_out_nov_dez".split("_"),ordinal:function(e){return e+"º"},weekStart:1,yearStart:4,formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD/MM/YYYY",LL:"D [de] MMMM [de] YYYY",LLL:"D [de] MMMM [de] YYYY [às] HH:mm",LLLL:"dddd, D [de] MMMM [de] YYYY [às] HH:mm"},relativeTime:{future:"em %s",past:"há %s",s:"alguns segundos",m:"um minuto",mm:"%d minutos",h:"uma hora",hh:"%d horas",d:"um dia",dd:"%d dias",M:"um mês",MM:"%d meses",y:"um ano",yy:"%d anos"}};return a.default.locale(n,null,!0),n}(Ct()));var Da,Sa={exports:{}};Da||(Da=1,Sa.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"ro",weekdays:"Duminică_Luni_Marți_Miercuri_Joi_Vineri_Sâmbătă".split("_"),weekdaysShort:"Dum_Lun_Mar_Mie_Joi_Vin_Sâm".split("_"),weekdaysMin:"Du_Lu_Ma_Mi_Jo_Vi_Sâ".split("_"),months:"Ianuarie_Februarie_Martie_Aprilie_Mai_Iunie_Iulie_August_Septembrie_Octombrie_Noiembrie_Decembrie".split("_"),monthsShort:"Ian._Febr._Mart._Apr._Mai_Iun._Iul._Aug._Sept._Oct._Nov._Dec.".split("_"),weekStart:1,formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD.MM.YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY H:mm",LLLL:"dddd, D MMMM YYYY H:mm"},relativeTime:{future:"peste %s",past:"acum %s",s:"câteva secunde",m:"un minut",mm:"%d minute",h:"o oră",hh:"%d ore",d:"o zi",dd:"%d zile",M:"o lună",MM:"%d luni",y:"un an",yy:"%d ani"},ordinal:function(e){return e}};return a.default.locale(n,null,!0),n}(Ct()));var xa,Ya={exports:{}};xa||(xa=1,Ya.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n="января_февраля_марта_апреля_мая_июня_июля_августа_сентября_октября_ноября_декабря".split("_"),i="январь_февраль_март_апрель_май_июнь_июль_август_сентябрь_октябрь_ноябрь_декабрь".split("_"),r="янв._февр._мар._апр._мая_июня_июля_авг._сент._окт._нояб._дек.".split("_"),o="янв._февр._март_апр._май_июнь_июль_авг._сент._окт._нояб._дек.".split("_"),s=/D[oD]?(\[[^[\]]*\]|\s)+MMMM?/;function l(e,t,a){var n,i;return"m"===a?t?"минута":"минуту":e+" "+(n=+e,i={mm:t?"минута_минуты_минут":"минуту_минуты_минут",hh:"час_часа_часов",dd:"день_дня_дней",MM:"месяц_месяца_месяцев",yy:"год_года_лет"}[a].split("_"),n%10==1&&n%100!=11?i[0]:n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?i[1]:i[2])}var d=function(e,t){return s.test(t)?n[e.month()]:i[e.month()]};d.s=i,d.f=n;var _=function(e,t){return s.test(t)?r[e.month()]:o[e.month()]};_.s=o,_.f=r;var c={name:"ru",weekdays:"воскресенье_понедельник_вторник_среда_четверг_пятница_суббота".split("_"),weekdaysShort:"вск_пнд_втр_срд_чтв_птн_сбт".split("_"),weekdaysMin:"вс_пн_вт_ср_чт_пт_сб".split("_"),months:d,monthsShort:_,weekStart:1,yearStart:4,formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD.MM.YYYY",LL:"D MMMM YYYY г.",LLL:"D MMMM YYYY г., H:mm",LLLL:"dddd, D MMMM YYYY г., H:mm"},relativeTime:{future:"через %s",past:"%s назад",s:"несколько секунд",m:l,mm:l,h:"час",hh:l,d:"день",dd:l,M:"месяц",MM:l,y:"год",yy:l},ordinal:function(e){return e},meridiem:function(e){return e<4?"ночи":e<12?"утра":e<17?"дня":"вечера"}};return a.default.locale(c,null,!0),c}(Ct()));var za,La={exports:{}};za||(za=1,La.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e);function n(e){return e>1&&e<5&&1!=~~(e/10)}function i(e,t,a,i){var r=e+" ";switch(a){case"s":return t||i?"pár sekúnd":"pár sekundami";case"m":return t?"minúta":i?"minútu":"minútou";case"mm":return t||i?r+(n(e)?"minúty":"minút"):r+"minútami";case"h":return t?"hodina":i?"hodinu":"hodinou";case"hh":return t||i?r+(n(e)?"hodiny":"hodín"):r+"hodinami";case"d":return t||i?"deň":"dňom";case"dd":return t||i?r+(n(e)?"dni":"dní"):r+"dňami";case"M":return t||i?"mesiac":"mesiacom";case"MM":return t||i?r+(n(e)?"mesiace":"mesiacov"):r+"mesiacmi";case"y":return t||i?"rok":"rokom";case"yy":return t||i?r+(n(e)?"roky":"rokov"):r+"rokmi"}}var r={name:"sk",weekdays:"nedeľa_pondelok_utorok_streda_štvrtok_piatok_sobota".split("_"),weekdaysShort:"ne_po_ut_st_št_pi_so".split("_"),weekdaysMin:"ne_po_ut_st_št_pi_so".split("_"),months:"január_február_marec_apríl_máj_jún_júl_august_september_október_november_december".split("_"),monthsShort:"jan_feb_mar_apr_máj_jún_júl_aug_sep_okt_nov_dec".split("_"),weekStart:1,yearStart:4,ordinal:function(e){return e+"."},formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY H:mm",LLLL:"dddd D. MMMM YYYY H:mm",l:"D. M. YYYY"},relativeTime:{future:"za %s",past:"pred %s",s:i,m:i,mm:i,h:i,hh:i,d:i,dd:i,M:i,MM:i,y:i,yy:i}};return a.default.locale(r,null,!0),r}(Ct()));var ja,Ea={exports:{}};ja||(ja=1,Ea.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e);function n(e){return e%100==2}function i(e){return e%100==3||e%100==4}function r(e,t,a,r){var o=e+" ";switch(a){case"s":return t||r?"nekaj sekund":"nekaj sekundami";case"m":return t?"ena minuta":"eno minuto";case"mm":return n(e)?o+(t||r?"minuti":"minutama"):i(e)?o+(t||r?"minute":"minutami"):o+(t||r?"minut":"minutami");case"h":return t?"ena ura":"eno uro";case"hh":return n(e)?o+(t||r?"uri":"urama"):i(e)?o+(t||r?"ure":"urami"):o+(t||r?"ur":"urami");case"d":return t||r?"en dan":"enim dnem";case"dd":return n(e)?o+(t||r?"dneva":"dnevoma"):o+(t||r?"dni":"dnevi");case"M":return t||r?"en mesec":"enim mesecem";case"MM":return n(e)?o+(t||r?"meseca":"mesecema"):i(e)?o+(t||r?"mesece":"meseci"):o+(t||r?"mesecev":"meseci");case"y":return t||r?"eno leto":"enim letom";case"yy":return n(e)?o+(t||r?"leti":"letoma"):i(e)?o+(t||r?"leta":"leti"):o+(t||r?"let":"leti")}}var o={name:"sl",weekdays:"nedelja_ponedeljek_torek_sreda_četrtek_petek_sobota".split("_"),months:"januar_februar_marec_april_maj_junij_julij_avgust_september_oktober_november_december".split("_"),weekStart:1,weekdaysShort:"ned._pon._tor._sre._čet._pet._sob.".split("_"),monthsShort:"jan._feb._mar._apr._maj._jun._jul._avg._sep._okt._nov._dec.".split("_"),weekdaysMin:"ne_po_to_sr_če_pe_so".split("_"),ordinal:function(e){return e+"."},formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD.MM.YYYY",LL:"D. MMMM YYYY",LLL:"D. MMMM YYYY H:mm",LLLL:"dddd, D. MMMM YYYY H:mm",l:"D. M. YYYY"},relativeTime:{future:"čez %s",past:"pred %s",s:r,m:r,mm:r,h:r,hh:r,d:r,dd:r,M:r,MM:r,y:r,yy:r}};return a.default.locale(o,null,!0),o}(Ct()));var Ca,Ha={exports:{}};Ca||(Ca=1,Ha.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"sv",weekdays:"söndag_måndag_tisdag_onsdag_torsdag_fredag_lördag".split("_"),weekdaysShort:"sön_mån_tis_ons_tor_fre_lör".split("_"),weekdaysMin:"sö_må_ti_on_to_fr_lö".split("_"),months:"januari_februari_mars_april_maj_juni_juli_augusti_september_oktober_november_december".split("_"),monthsShort:"jan_feb_mar_apr_maj_jun_jul_aug_sep_okt_nov_dec".split("_"),weekStart:1,yearStart:4,ordinal:function(e){var t=e%10;return"["+e+(1===t||2===t?"a":"e")+"]"},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"YYYY-MM-DD",LL:"D MMMM YYYY",LLL:"D MMMM YYYY [kl.] HH:mm",LLLL:"dddd D MMMM YYYY [kl.] HH:mm",lll:"D MMM YYYY HH:mm",llll:"ddd D MMM YYYY HH:mm"},relativeTime:{future:"om %s",past:"för %s sedan",s:"några sekunder",m:"en minut",mm:"%d minuter",h:"en timme",hh:"%d timmar",d:"en dag",dd:"%d dagar",M:"en månad",MM:"%d månader",y:"ett år",yy:"%d år"}};return a.default.locale(n,null,!0),n}(Ct()));var Fa,Va={exports:{}};Fa||(Fa=1,Va.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"th",weekdays:"อาทิตย์_จันทร์_อังคาร_พุธ_พฤหัสบดี_ศุกร์_เสาร์".split("_"),weekdaysShort:"อาทิตย์_จันทร์_อังคาร_พุธ_พฤหัส_ศุกร์_เสาร์".split("_"),weekdaysMin:"อา._จ._อ._พ._พฤ._ศ._ส.".split("_"),months:"มกราคม_กุมภาพันธ์_มีนาคม_เมษายน_พฤษภาคม_มิถุนายน_กรกฎาคม_สิงหาคม_กันยายน_ตุลาคม_พฤศจิกายน_ธันวาคม".split("_"),monthsShort:"ม.ค._ก.พ._มี.ค._เม.ย._พ.ค._มิ.ย._ก.ค._ส.ค._ก.ย._ต.ค._พ.ย._ธ.ค.".split("_"),formats:{LT:"H:mm",LTS:"H:mm:ss",L:"DD/MM/YYYY",LL:"D MMMM YYYY",LLL:"D MMMM YYYY เวลา H:mm",LLLL:"วันddddที่ D MMMM YYYY เวลา H:mm"},relativeTime:{future:"อีก %s",past:"%sที่แล้ว",s:"ไม่กี่วินาที",m:"1 นาที",mm:"%d นาที",h:"1 ชั่วโมง",hh:"%d ชั่วโมง",d:"1 วัน",dd:"%d วัน",M:"1 เดือน",MM:"%d เดือน",y:"1 ปี",yy:"%d ปี"},ordinal:function(e){return e+"."}};return a.default.locale(n,null,!0),n}(Ct()));var Oa,Aa={exports:{}};Oa||(Oa=1,Aa.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n="січня_лютого_березня_квітня_травня_червня_липня_серпня_вересня_жовтня_листопада_грудня".split("_"),i="січень_лютий_березень_квітень_травень_червень_липень_серпень_вересень_жовтень_листопад_грудень".split("_"),r=/D[oD]?(\[[^[\]]*\]|\s)+MMMM?/;function o(e,t,a){var n,i;return"m"===a?t?"хвилина":"хвилину":"h"===a?t?"година":"годину":e+" "+(n=+e,i={ss:t?"секунда_секунди_секунд":"секунду_секунди_секунд",mm:t?"хвилина_хвилини_хвилин":"хвилину_хвилини_хвилин",hh:t?"година_години_годин":"годину_години_годин",dd:"день_дні_днів",MM:"місяць_місяці_місяців",yy:"рік_роки_років"}[a].split("_"),n%10==1&&n%100!=11?i[0]:n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?i[1]:i[2])}var s=function(e,t){return r.test(t)?n[e.month()]:i[e.month()]};s.s=i,s.f=n;var l={name:"uk",weekdays:"неділя_понеділок_вівторок_середа_четвер_п’ятниця_субота".split("_"),weekdaysShort:"ндл_пнд_втр_срд_чтв_птн_сбт".split("_"),weekdaysMin:"нд_пн_вт_ср_чт_пт_сб".split("_"),months:s,monthsShort:"січ_лют_бер_квіт_трав_черв_лип_серп_вер_жовт_лист_груд".split("_"),weekStart:1,relativeTime:{future:"за %s",past:"%s тому",s:"декілька секунд",m:o,mm:o,h:o,hh:o,d:"день",dd:o,M:"місяць",MM:o,y:"рік",yy:o},ordinal:function(e){return e},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD.MM.YYYY",LL:"D MMMM YYYY р.",LLL:"D MMMM YYYY р., HH:mm",LLLL:"dddd, D MMMM YYYY р., HH:mm"}};return a.default.locale(l,null,!0),l}(Ct()));var Pa,Ia={exports:{}};Pa||(Pa=1,Ia.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"vi",weekdays:"chủ nhật_thứ hai_thứ ba_thứ tư_thứ năm_thứ sáu_thứ bảy".split("_"),months:"tháng 1_tháng 2_tháng 3_tháng 4_tháng 5_tháng 6_tháng 7_tháng 8_tháng 9_tháng 10_tháng 11_tháng 12".split("_"),weekStart:1,weekdaysShort:"CN_T2_T3_T4_T5_T6_T7".split("_"),monthsShort:"Th01_Th02_Th03_Th04_Th05_Th06_Th07_Th08_Th09_Th10_Th11_Th12".split("_"),weekdaysMin:"CN_T2_T3_T4_T5_T6_T7".split("_"),ordinal:function(e){return e},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"DD/MM/YYYY",LL:"D MMMM [năm] YYYY",LLL:"D MMMM [năm] YYYY HH:mm",LLLL:"dddd, D MMMM [năm] YYYY HH:mm",l:"DD/M/YYYY",ll:"D MMM YYYY",lll:"D MMM YYYY HH:mm",llll:"ddd, D MMM YYYY HH:mm"},relativeTime:{future:"%s tới",past:"%s trước",s:"vài giây",m:"một phút",mm:"%d phút",h:"một giờ",hh:"%d giờ",d:"một ngày",dd:"%d ngày",M:"một tháng",MM:"%d tháng",y:"một năm",yy:"%d năm"}};return a.default.locale(n,null,!0),n}(Ct()));var Na,Wa={exports:{}};Na||(Na=1,Wa.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"zh-cn",weekdays:"星期日_星期一_星期二_星期三_星期四_星期五_星期六".split("_"),weekdaysShort:"周日_周一_周二_周三_周四_周五_周六".split("_"),weekdaysMin:"日_一_二_三_四_五_六".split("_"),months:"一月_二月_三月_四月_五月_六月_七月_八月_九月_十月_十一月_十二月".split("_"),monthsShort:"1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),ordinal:function(e,t){return"W"===t?e+"周":e+"日"},weekStart:1,yearStart:4,formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"YYYY/MM/DD",LL:"YYYY年M月D日",LLL:"YYYY年M月D日Ah点mm分",LLLL:"YYYY年M月D日ddddAh点mm分",l:"YYYY/M/D",ll:"YYYY年M月D日",lll:"YYYY年M月D日 HH:mm",llll:"YYYY年M月D日dddd HH:mm"},relativeTime:{future:"%s内",past:"%s前",s:"几秒",m:"1 分钟",mm:"%d 分钟",h:"1 小时",hh:"%d 小时",d:"1 天",dd:"%d 天",M:"1 个月",MM:"%d 个月",y:"1 年",yy:"%d 年"},meridiem:function(e,t){var a=100*e+t;return a<600?"凌晨":a<900?"早上":a<1100?"上午":a<1300?"中午":a<1800?"下午":"晚上"}};return a.default.locale(n,null,!0),n}(Ct()));var Ua,Ba={exports:{}};function Ra(e,t,a,n){const i=!e.start.dateTime;let r,o;i?(r=qa(e.start.date||""),o=qa(e.end.date||"")):(r=new Date(e.start.dateTime||""),o=new Date(e.end.dateTime||""));const s=Tt(a);if(i){const e=new Date(o);return e.setDate(e.getDate()-1),r.toDateString()!==e.toDateString()?Za(function(e,t,a){const n=new Date,i=new Date(n.getFullYear(),n.getMonth(),n.getDate()),r=new Date(i);if(r.setDate(r.getDate()+1),e.toDateString()===i.toDateString())return`${a.allDay}, ${a.endsToday}`;if(e.toDateString()===r.toDateString())return`${a.allDay}, ${a.endsTomorrow}`;const o=e.getDate(),s=a.months[e.getMonth()];switch($t(t)){case"day-dot-month":return`${a.allDay}, ${a.multiDay} ${o}. ${s}`;case"month-day":return`${a.allDay}, ${a.multiDay} ${s} ${o}`;default:return`${a.allDay}, ${a.multiDay} ${o} ${s}`}}(e,a,s)):Za(s.allDay)}const l=!("system"!==t.time_24h||!(null==n?void 0:n.locale)),d=!0===t.time_24h;return r.toDateString()!==o.toDateString()?Za(function(e,t,a,n,i,r=!0,o){const s=new Date,l=new Date(s.getFullYear(),s.getMonth(),s.getDate()),d=new Date(l);d.setDate(d.getDate()+1);const _=e=>{if(i&&(null==o?void 0:o.locale)){return Qa(e,xt(o.locale,r))}return Qa(e,r)};let c;if(t.toDateString()===l.toDateString())c=`${n.endsToday} ${n.at} ${_(t)}`;else if(t.toDateString()===d.toDateString())c=`${n.endsTomorrow} ${n.at} ${_(t)}`;else{const e=t.getDate(),i=n.months[t.getMonth()],r=n.fullDaysOfWeek[t.getDay()],o=_(t);switch($t(a)){case"day-dot-month":c=`${r}, ${e}. ${i} ${n.at} ${o}`;break;case"month-day":c=`${r}, ${i} ${e} ${n.at} ${o}`;break;default:c=`${r}, ${e} ${i} ${n.at} ${o}`}}if(l.getTime()<=e.getTime()){return`${_(e)} ${n.multiDay} ${c}`}return t.toDateString()===l.toDateString()||t.toDateString()===d.toDateString()?c:`${n.multiDay} ${c}`}(r,o,a,s,l,d,n)):Za(function(e,t,a,n,i=!0,r){if(n&&(null==r?void 0:r.locale)){const n=xt(r.locale,i);return a?`${Qa(e,n)} - ${Qa(t,n)}`:Qa(e,n)}return a?`${Qa(e,i)} - ${Qa(t,i)}`:Qa(e,i)}(r,o,t.show_end_time,l,d,n))}function Ka(e,t="en"){if(e._isEmptyDay||!e.start)return null;const a=new Date,n=e.start.dateTime?new Date(e.start.dateTime):e.start.date?qa(e.start.date):null;return!n||n<=a?null:function(e,t){const a=function(e){const t=e.toLowerCase();if("zh-cn"===t||"zh-tw"===t)return t;const a=t.split("-")[0];return["bg","cs","da","de","el","en","es","fi","fr","he","hr","hu","is","it","nb","nl","nn","pl","pt","ru","sk","sl","sv","th","uk","vi","zh-cn","zh-tw"].includes(a)?a:"en"}(t);return Ft(e).locale(a).fromNow()}(n,t)}function Ja(e,t=!0){if(!e)return"";if(!1===t)return e;const a=e.trim();if("string"==typeof t&&"true"!==t){const e=new RegExp(`(${t})\\s*$`,"i");return a.replace(e,"").replace(/,?\s*$/,"")}for(const e of Ae)if(a.endsWith(e))return a.slice(0,a.length-e.length).replace(/,?\s*$/,"");return a}function Za(e){return e&&0!==e.length?e.charAt(0).toUpperCase()+e.slice(1):e}function qa(e){const[t,a,n]=e.split("-").map(Number);return new Date(t,a-1,n)}function Ga(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}function Qa(e,t=!0){let a=e.getHours();const n=e.getMinutes();if(!t){const e=a>=12?"PM":"AM";return a=a%12||12,`${a}:${n.toString().padStart(2,"0")} ${e}`}return`${a}:${n.toString().padStart(2,"0")}`}function Xa(e){const t=new Date(e);t.setDate(t.getDate()+4-(t.getDay()||7));const a=new Date(t.getFullYear(),0,1);return Math.ceil(((t.getTime()-a.getTime())/864e5+1)/7)}function en(e,t,a){const n=t||"iso";return"iso"===n?Xa(e):"simple"===n?function(e,t=0){const a=new Date(e),n=new Date(a.getFullYear(),0,1),i=Math.floor((a.getTime()-n.getTime())/864e5),r=(n.getDay()-t+7)%7;return Math.ceil((i+r+1)/7)}(e,a):null}Ua||(Ua=1,Ba.exports=function(e){function t(e){return e&&"object"==typeof e&&"default"in e?e:{default:e}}var a=t(e),n={name:"zh-tw",weekdays:"星期日_星期一_星期二_星期三_星期四_星期五_星期六".split("_"),weekdaysShort:"週日_週一_週二_週三_週四_週五_週六".split("_"),weekdaysMin:"日_一_二_三_四_五_六".split("_"),months:"一月_二月_三月_四月_五月_六月_七月_八月_九月_十月_十一月_十二月".split("_"),monthsShort:"1月_2月_3月_4月_5月_6月_7月_8月_9月_10月_11月_12月".split("_"),ordinal:function(e,t){return"W"===t?e+"週":e+"日"},formats:{LT:"HH:mm",LTS:"HH:mm:ss",L:"YYYY/MM/DD",LL:"YYYY年M月D日",LLL:"YYYY年M月D日 HH:mm",LLLL:"YYYY年M月D日dddd HH:mm",l:"YYYY/M/D",ll:"YYYY年M月D日",lll:"YYYY年M月D日 HH:mm",llll:"YYYY年M月D日dddd HH:mm"},relativeTime:{future:"%s內",past:"%s前",s:"幾秒",m:"1 分鐘",mm:"%d 分鐘",h:"1 小時",hh:"%d 小時",d:"1 天",dd:"%d 天",M:"1 個月",MM:"%d 個月",y:"1 年",yy:"%d 年"},meridiem:function(e,t){var a=100*e+t;return a<600?"凌晨":a<900?"早上":a<1100?"上午":a<1300?"中午":a<1800?"下午":"晚上"}};return a.default.locale(n,null,!0),n}(Ct())),Ft.extend(Pt);var tn=Object.defineProperty,an=Object.defineProperties,nn=Object.getOwnPropertyDescriptors,rn=Object.getOwnPropertySymbols,on=Object.prototype.hasOwnProperty,sn=Object.prototype.propertyIsEnumerable,ln=(e,t,a)=>t in e?tn(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a,dn=(e,t)=>{for(var a in t||(t={}))on.call(t,a)&&ln(e,a,t[a]);if(rn)for(var a of rn(t))sn.call(t,a)&&ln(e,a,t[a]);return e},_n=(e,t)=>an(e,nn(t));async function cn(e,t,a,n=!1){const i=function(e,t,a,n,i,r=!1){const o=t.map((e=>"string"==typeof e?e:e.entity)).sort().join("_");let s="";if(i)try{s=i.includes("T")?i.split("T")[0]:i}catch(e){s=i}const l=s?`_${s}`:"",d=r?"_filtered":"",_=[];t.forEach((e=>{"string"!=typeof e&&(e.blocklist&&_.push(`b:${e.entity}:${e.blocklist}`),e.allowlist&&_.push(`a:${e.entity}:${e.allowlist}`))}));const c=_.length>0?`_filters:${encodeURIComponent(_.join("|"))}`:"";return`${Ye}${e}_${o}_${a}_${n?1:0}${l}${d}${c}${De}`}(a,t.entities,t.days_to_show,t.show_past_events,t.start_date,t.filter_duplicates),r=function(){if(window.performance&&window.performance.navigation)return 1===window.performance.navigation.type;if(window.performance&&window.performance.getEntriesByType){const e=window.performance.getEntriesByType("navigation");if(e.length>0&&"type"in e[0])return"reload"===e[0].type}return!1}();if(!n){const e=function(e,t,a=!1){const n=Mn(e,t,a);if(n)return[...n.events];return null}(i,t,r);if(e)return tt(`Using ${e.length} events from cache`),[...e]}tt("Fetching events from API");const o=t.entities.map((e=>"string"==typeof e?{entity:e,color:"var(--primary-text-color)"}:e)),s=bn(t.days_to_show,t.start_date),l=await async function(e,t,a){const n=[],i=new Set;for(const r of t)if(!i.has(r.entity))try{const t=`calendars/${r.entity}?start=${a.start.toISOString()}&end=${a.end.toISOString()}`;tt(`Fetching calendar events with path: ${t}`);const o=await e.callApi("GET",t);if(!o||!Array.isArray(o)){et(`Invalid response for ${r.entity}`);continue}const s=o.map((e=>_n(dn({},e),{_entityId:r.entity})));n.push(...s),i.add(r.entity)}catch(t){Xe(`Failed to fetch events for ${r.entity}:`,t);try{tt("Available hass API methods:",Object.keys(e).filter((t=>"function"==typeof e[t])))}catch(e){}}return n}(e,o,s);let d=function(e,t){const a=[],n=t.filter_duplicates?new Set:void 0;t.entities.forEach((i=>{const r="string"==typeof i?i:i.entity,o=e.filter((e=>e._entityId===r));if(0===o.length)return;let s=function(e,t){if("string"==typeof t)return[...e];let a=[...e];if(t.allowlist)try{const e=new RegExp(t.allowlist,"i");a=a.filter((t=>t.summary&&e.test(t.summary)))}catch(e){et(`Invalid allowlist pattern: ${t.allowlist}`,e)}else if(t.blocklist)try{const e=new RegExp(t.blocklist,"i");a=a.filter((t=>!(t.summary&&e.test(t.summary))))}catch(e){et(`Invalid blocklist pattern: ${t.blocklist}`,e)}return a}(o,i);s=s.filter((e=>{if(!n)return!0;const t=function(e){const t=e.summary||"",a=e.location||"";let n="";if(e.start.dateTime){n=`${new Date(e.start.dateTime).getTime()}|${e.end.dateTime?new Date(e.end.dateTime).getTime():0}`}else n=`${e.start.date||""}|${e.end.date||""}`;return`${t}|${n}|${a}`}(e);return!n.has(t)&&(n.add(t),!0)})),s.forEach((e=>{e._matchedConfig="object"==typeof i?i:void 0,e._entityLabel=vn(r,t,e)})),a.push(...s)}));const i=function(e,t){const a=[];for(const n of e){if(!gn(n,t)){a.push(n);continue}if(!mn(n)){a.push(n);continue}const e=fn(n);a.push(...e)}return a}(a,t);return at(`Processed ${i.length} events after filtering and splitting`),i}(l,t);const _=Tn(t),c=new Date(_);return c.setDate(c.getDate()+t.days_to_show),d=d.filter((e=>{if(!e.start)return!1;let t;if(e.start.dateTime)t=new Date(e.start.dateTime);else{if(!e.start.date)return!1;t=qa(e.start.date)}return t<c})),function(e,t){try{tt(`Caching ${t.length} events`);const a={events:t,timestamp:Date.now()};return localStorage.setItem(e,JSON.stringify(a)),null!==Mn(e)}catch(e){return Xe("Failed to cache calendar events:",e),!1}}(i,d),d}function hn(e,t,a,n){const i=Tn(t),r=new Date(i),o=new Date(r);o.setHours(23,59,59,999);const s=new Date,l=e.filter((e=>{if(!(null==e?void 0:e.start)||!(null==e?void 0:e.end))return!1;const a=!e.start.dateTime;let n,i;if(a){if(n=e.start.date?qa(e.start.date):null,i=e.end.date?qa(e.end.date):null,i){const e=new Date(i);e.setDate(e.getDate()-1),i=e}}else n=e.start.dateTime?new Date(e.start.dateTime):null,i=e.end.dateTime?new Date(e.end.dateTime):null;if(!n||!i)return!1;return!!(n>=r&&n<=o||n>o||i>=r)&&!(!t.show_past_events&&!a&&i<s)})),d={};l.length>0&&l.forEach((e=>{var a;let i,o,s;if(!e.start.dateTime){if(i=e.start.date?qa(e.start.date):null,o=e.end.date?qa(e.end.date):null,o){const e=new Date(o);e.setDate(e.getDate()-1),o=e}}else i=e.start.dateTime?new Date(e.start.dateTime):null,o=e.end.dateTime?new Date(e.end.dateTime):null;if(!i||!o)return;s=i>=r?i:o.toDateString()===r.toDateString()||i<r&&o>r?r:i;const l=Ga(s),_=Tt(n);d[l]||(d[l]={weekday:_.daysOfWeek[s.getDay()],day:s.getDate(),month:_.months[s.getMonth()],timestamp:s.getTime(),events:[]}),d[l].events.push({summary:e.summary||"",time:Ra(e,t,n),location:(null!=(a=wn(e._entityId,"show_location",t,e))?a:t.show_location)?Ja(e.location||"",t.remove_location_country):"",start:e.start,end:e.end,_entityId:e._entityId,_entityLabel:vn(e._entityId,t,e),_matchedConfig:e._matchedConfig,_isEmptyDay:e._isEmptyDay})}));const _=function(e,t="en"){if("sunday"===e)return 0;if("monday"===e)return 1;try{return/^en-(US|CA)|es-US/.test(t)?0:1}catch(e){return 1}}(t.first_day_of_week,n);Object.values(d).forEach((e=>{const a=new Date(e.timestamp);e.weekNumber=$n(a,t,_),e.monthNumber=a.getMonth(),e.isFirstDayOfMonth=1===a.getDate(),e.isFirstDayOfWeek=a.getDay()===_})),Object.values(d).forEach((e=>{e.events.sort(((e,a)=>{const n=!e.start.dateTime,i=!a.start.dateTime;if(n&&!i)return-1;if(!n&&i)return 1;let r,o;if(r=n&&e.start.date?qa(e.start.date).getTime():e.start.dateTime?new Date(e.start.dateTime).getTime():0,o=i&&a.start.date?qa(a.start.date).getTime():a.start.dateTime?new Date(a.start.dateTime).getTime():0,n&&i&&r===o){const n=un(e._entityId,t),i=un(a._entityId,t);return n!==i?n-i:(e.summary||"").localeCompare(a.summary||"",void 0,{sensitivity:"base"})}return r-o}))}));const c=a?t.days_to_show:Math.min(t.compact_days_to_show||t.days_to_show,t.days_to_show);let h=Object.values(d).sort(((e,t)=>e.timestamp-t.timestamp)).slice(0,c||3);if(!a){const e=new Map;for(const a of h){const n=[];for(const i of a.events){if(i._isEmptyDay){n.push(i);continue}const a=i._entityId,r=i._matchedConfig;let o=-1;r?o=t.entities.findIndex((e=>"object"==typeof e&&e===r)):a&&(o=t.entities.findIndex((e=>"string"==typeof e&&e===a)));const s=-1!==o?`${a}__${o}`:a||"",l=null==r?void 0:r.compact_events_to_show;if(void 0===l){n.push(i);continue}const d=e.get(s)||0;d<l&&(n.push(i),e.set(s,d+1))}a.events=n}t.show_empty_days||(h=h.filter((e=>e.events.length>0&&!(1===e.events.length&&e.events[0]._isEmptyDay))))}if(!a){const e=t.compact_events_to_show;if(void 0!==e){let a=[],n=0;if(t.compact_events_complete_days){const t=new Set;for(const a of h)if((1!==a.events.length||!a.events[0]._isEmptyDay)&&n<e&&a.events.length>0){const i=Math.min(a.events.length,e-n);i>0&&(t.add(Ga(new Date(a.timestamp))),n+=i)}a=h.filter((e=>{const a=Ga(new Date(e.timestamp));return t.has(a)}))}else{a=[];for(const t of h){if(n>=e&&(1!==t.events.length||!t.events[0]._isEmptyDay))break;if(1===t.events.length&&t.events[0]._isEmptyDay){a.push(t);continue}const i=e-n;if(i>0&&t.events.length>0){const e=_n(dn({},t),{events:t.events.slice(0,i)});a.push(e),n+=e.events.length}}}h=a}}if(t.show_empty_days||0===h.length){const e=Tt(n),r=new Date(i);let o;if(a)o=new Date(i),o.setDate(o.getDate()+c-1);else if(0===h.length)t.show_empty_days?(o=new Date(i),o.setDate(o.getDate()+c-1)):o=new Date(i);else if(t.compact_days_to_show&&!t.compact_events_to_show)o=new Date(i),o.setDate(o.getDate()+c-1);else if(t.compact_events_to_show)if(h.length>0){const e=Math.max(...h.map((e=>e.timestamp)));o=new Date(e)}else o=new Date(i);else o=new Date(i),o.setDate(o.getDate()+c-1);const s=new Set(h.map((e=>Ga(new Date(e.timestamp))))),l=[...h],d=Math.floor((o.getTime()-r.getTime())/864e5);for(let a=0;a<=d;a++){const n=new Date(r);n.setDate(r.getDate()+a);const i=Ga(n);if(!s.has(i)){const a=$n(n,t,_),r={weekday:e.daysOfWeek[n.getDay()],day:n.getDate(),month:e.months[n.getMonth()],timestamp:n.getTime(),events:[{summary:e.noEvents,start:{date:i},end:{date:i},_entityId:"_empty_day_",_isEmptyDay:!0,location:""}],weekNumber:a,monthNumber:n.getMonth(),isFirstDayOfMonth:1===n.getDate(),isFirstDayOfWeek:n.getDay()===_};l.push(r)}}l.sort(((e,t)=>e.timestamp-t.timestamp)),h=l}return h.slice(0,c)}function un(e,t){if(!e)return Number.MAX_SAFE_INTEGER;const a=t.entities.findIndex((t=>"string"==typeof t?t===e:t.entity===e));return-1!==a?a:Number.MAX_SAFE_INTEGER}function mn(e){if(!e.start||!e.end)return!1;if(e.start.date&&e.end.date){const t=new Date(e.start.date),a=new Date(e.end.date);return a.setDate(a.getDate()-1),t.toDateString()!==a.toDateString()}if(e.start.dateTime&&e.end.dateTime){const t=new Date(e.start.dateTime),a=new Date(e.end.dateTime);return t.toDateString()!==a.toDateString()}return!1}function gn(e,t){return e._entityId&&e._matchedConfig&&void 0!==e._matchedConfig.split_multiday_events?e._matchedConfig.split_multiday_events:t.split_multiday_events}function pn(e){return`${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,"0")}-${String(e.getDate()).padStart(2,"0")}`}function fn(e){const t=[];if(e.start.date&&e.end.date){const a=qa(e.start.date),n=qa(e.end.date);n.setDate(n.getDate()-1);for(let i=new Date(a);i<=n;i.setDate(i.getDate()+1)){const a=pn(i),n=new Date(i);n.setDate(n.getDate()+1);const r=pn(n),o=_n(dn({},e),{start:{date:a},end:{date:r}});t.push(o)}}else if(e.start.dateTime&&e.end.dateTime){const a=new Date(e.start.dateTime),n=new Date(e.end.dateTime),i=new Date(a);if(i.setHours(23,59,59,999),i<n){const r=_n(dn({},e),{start:{dateTime:a.toISOString()},end:{dateTime:i.toISOString()}});t.push(r);const o=new Date(a);o.setDate(o.getDate()+1),o.setHours(0,0,0,0);const s=new Date(n);s.setHours(0,0,0,0);for(let a=new Date(o);a<s;a.setDate(a.getDate()+1)){const n=pn(a),i=new Date(a);i.setDate(i.getDate()+1);const r=pn(i),o=_n(dn({},e),{start:{date:n},end:{date:r}});t.push(o)}const l=_n(dn({},e),{start:{dateTime:s.toISOString()},end:{dateTime:n.toISOString()}});t.push(l)}else t.push(dn({},e))}return t}function yn(e,t,a,n){if(!e)return"var(--calendar-card-line-color-vertical)";let i;i=n&&n._matchedConfig?n._matchedConfig:t.entities.find((t=>"string"==typeof t&&t===e||"object"==typeof t&&t.entity===e));const r="string"==typeof i?t.accent_color:(null==i?void 0:i.accent_color)||t.accent_color;return void 0===a||0===a||isNaN(a)?r:function(e,t){if(e.startsWith("var("))return`rgba(var(--calendar-color-rgb, 3, 169, 244), ${t/100})`;if("transparent"===e)return e;const a=document.createElement("div");a.style.display="none",a.style.color=e,document.body.appendChild(a);const n=getComputedStyle(a).color;if(document.body.removeChild(a),!n)return e;const i=n.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);if(i){const[,e,a,n]=i;return`rgba(${e}, ${a}, ${n}, ${t/100})`}const r=n.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);if(r){const[,e,a,n]=r;return`rgba(${e}, ${a}, ${n}, ${t/100})`}return e}(r,a)}function vn(e,t,a){if(!e)return;if(a&&a._matchedConfig)return a._matchedConfig.label;const n=t.entities.find((t=>"string"==typeof t&&t===e||"object"==typeof t&&t.entity===e));return n&&"string"!=typeof n?n.label:void 0}function wn(e,t,a,n){if(!e)return;if(n&&n._matchedConfig)return n._matchedConfig[t];const i=a.entities.find((t=>"string"==typeof t&&t===e||"object"==typeof t&&t.entity===e));return i&&"string"!=typeof i?i[t]:void 0}function kn(e){if(!e||e._isEmptyDay)return!1;const t=new Date;if(!e.start.dateTime)return!1;const a=e.start.dateTime?new Date(e.start.dateTime):null,n=e.end.dateTime?new Date(e.end.dateTime):null;return!(!a||!n)&&(t>=a&&t<n)}function bn(e,t){let a;if(t&&""!==t.trim())try{const e=function(e){const t=e.match(/^([+-])(\d+)$/);if(t){const e="+"===t[1]?1:-1,a=parseInt(t[2],10);if(!isNaN(a)){const t=new Date;return t.setHours(0,0,0,0),t.setDate(t.getDate()+e*a),t}return null}const a=e.match(/^today([+-])(\d+)$/i);if(!a)return null;const n="+"===a[1]?1:-1,i=parseInt(a[2],10);if(isNaN(i))return null;const r=new Date;return r.setHours(0,0,0,0),r.setDate(r.getDate()+n*i),r}(t.trim());if(e)a=e;else if(t.includes("T"))a=new Date(t),isNaN(a.getTime())&&(et(`Invalid ISO date: ${t}, falling back to today`),a=new Date,a=new Date(a.getFullYear(),a.getMonth(),a.getDate()));else{const[e,n,i]=t.split("-").map(Number);e&&n&&i&&n>=1&&n<=12&&i>=1&&i<=31?(a=new Date(e,n-1,i),isNaN(a.getTime())&&(et(`Invalid date: ${t}, falling back to today`),a=new Date,a=new Date(a.getFullYear(),a.getMonth(),a.getDate()))):(et(`Malformed date: ${t}, falling back to today`),a=new Date,a=new Date(a.getFullYear(),a.getMonth(),a.getDate()))}}catch(e){et(`Error parsing date: ${t}, falling back to today`,e),a=new Date,a=new Date(a.getFullYear(),a.getMonth(),a.getDate())}else a=new Date,a=new Date(a.getFullYear(),a.getMonth(),a.getDate());a.setHours(0,0,0,0);const n=new Date(a),i=parseInt(e.toString())||3;return n.setDate(a.getDate()+i),n.setHours(23,59,59,999),{start:a,end:n}}function Mn(e,t,a=!1){try{const n=localStorage.getItem(e);if(!n)return null;const i=JSON.parse(n),r=Date.now();let o;o=a&&(null==t?void 0:t.refresh_on_navigate)?1e3*xe:function(e){return 60*((null==e?void 0:e.refresh_interval)||Se)*1e3}(t);return r-i.timestamp<o?i:(localStorage.removeItem(e),tt(`Cache expired and removed for ${e}`),null)}catch(t){et("Cache error:",t);try{localStorage.removeItem(e)}catch(e){}return null}}function Tn(e){if(e.start_date&&""!==e.start_date.trim()){return bn(e.days_to_show,e.start_date).start}const t=new Date;return new Date(t.getFullYear(),t.getMonth(),t.getDate())}function $n(e,t,a){let n=en(e,t.show_week_numbers,a);if("iso"===t.show_week_numbers&&0===a&&0===e.getDay()){const t=new Date(e);t.setDate(t.getDate()+1),n=Xa(t)}return n}function Dn(e){if(!e||!e.length)return;const t=e[0];return"string"==typeof t?t:t.entity}function Sn(e,t,a,n,i){if(!e||!t)return;const r={element:a};switch(e.action){case"more-info":!function(e,t){if(!e)return;const a=new CustomEvent("hass-more-info",{bubbles:!0,composed:!0,detail:{entityId:e}});t.element.dispatchEvent(a),at(`Fired more-info event for ${e}`)}(n,r);break;case"navigate":e.navigation_path&&function(e,t){const a=new CustomEvent("location-changed",{bubbles:!0,composed:!0,detail:{replace:!1}});window.history&&window.history.pushState(null,"",e);t.element.dispatchEvent(a),at(`Navigated to ${e}`)}(e.navigation_path,r);break;case"url":e.url_path&&(o=e.url_path,window.open(o,"_blank"),at(`Opened URL ${o}`));break;case"toggle":case"expand":i&&i();break;case"call-service":{if(!e.service)return;const[a,n]=e.service.split(".",2);if(!a||!n)return;t.callService(a,n,e.service_data||{});break}case"fire-dom-event":!function(e){const t=new Event("calendar-card-action",{bubbles:!0,composed:!0});e.dispatchEvent(t),at("Fired DOM event calendar-card-action")}(a)}var o}const xn=r`
  /* ===== CORE CONTAINER STYLES ===== */

  :host {
    display: block;
    height: 100%;
  }

  ha-card {
    /* Layout */
    display: flex;
    flex-direction: column;
    height: 100%;
    position: relative;
    overflow: hidden;

    /* Box model */
    box-sizing: border-box;
    padding: calc(var(--calendar-card-spacing-additional) + 16px) 16px
      calc(var(--calendar-card-spacing-additional) + 16px) 8px;

    /* Visual */
    background: var(--calendar-card-background-color, var(--card-background-color));
    cursor: pointer;
  }

  /* Focus states */
  ha-card:focus {
    outline: none;
  }

  ha-card:focus-visible {
    outline: 2px solid var(--calendar-card-line-color-vertical);
  }

  /* Structure containers for stable DOM */
  .header-container,
  .content-container {
    width: 100%;
  }

  /* Content container with unified scrolling behavior */
  .content-container {
    max-height: var(--calendar-card-max-height, none);
    height: var(--calendar-card-height, auto);
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 1px;
    hyphens: auto;

    /* Hide scrollbars across browsers */
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE/Edge */
  }

  /* Show scrollbars on hover */
  .content-container:hover {
    scrollbar-width: thin; /* Firefox */
    scrollbar-color: var(--secondary-text-color) transparent; /* Firefox */
    -ms-overflow-style: auto; /* IE/Edge */
  }

  .card-header-placeholder {
    height: 0;
  }

  /* ===== HEADER STYLES ===== */

  .card-header {
    /* Layout */
    float: left;

    /* Spacing */
    margin: 0 0 16px 8px;
    padding: 0;

    /* Typography */
    color: var(--calendar-card-color-title, var(--primary-text-color));
    font-size: var(--calendar-card-font-size-title, var(--paper-font-headline_-_font-size));
    font-weight: var(--paper-font-headline_-_font-weight);
    letter-spacing: var(--paper-font-headline_-_letter-spacing);
    line-height: var(--paper-font-headline_-_line-height);

    /* Additional Typography */
    -webkit-font-smoothing: var(--paper-font-headline_-_-webkit-font-smoothing);
    text-rendering: var(--paper-font-common-expensive-kerning_-_text-rendering);
    opacity: var(--dark-primary-opacity);
  }

  /* ===== WEEK NUMBER & SEPARATOR STYLES ===== */

  /* Table structure for week number pills and their separator lines
   * Creates consistent alignment with calendar data below */
  /* Margins are applied dynamically in renderWeekRow */
  .week-row-table {
    height: calc(var(--calendar-card-week-number-font-size) * 1.5);
    width: 100%;
    table-layout: fixed;
    padding-left: 8px;
    border-spacing: 0;
    border: none !important;
  }

  /* Make both cells take full height of the row */
  .week-number-cell,
  .separator-cell {
    height: 100%;
  }

  /* Left cell containing the week number pill
   * Sized to match date column width for proper alignment */
  .week-number-cell {
    width: var(--calendar-card-date-column-width);
    position: relative;
    text-align: center;
    vertical-align: middle;
    padding-right: 12px; /* Match date column padding */
  }

  /* Week number pill - positioned absolutely and centered within its cell */
  .week-number {
    width: calc(var(--calendar-card-week-number-font-size) * 2.5);
    height: calc(var(--calendar-card-week-number-font-size) * 1.5);
    display: inline-flex; /* Centering */
    align-items: center;
    justify-content: center;
    font-size: var(--calendar-card-week-number-font-size);
    font-weight: 500;
    color: var(--calendar-card-week-number-color);
    background-color: var(--calendar-card-week-number-bg-color);
    border-radius: 999px;
    box-sizing: border-box;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  /* Safari-specific adjustment for iOS vertical alignment issues */
  @supports (-webkit-touch-callout: none) {
    .week-number {
      /* Adjust padding to improve vertical alignment on iOS Safari */
      padding-top: calc(var(--calendar-card-week-number-font-size) * 0.1);
    }
  }

  /* Right cell containing the horizontal separator line
   * Takes up remaining width of the table */
  .separator-cell {
    vertical-align: middle;
  }

  /* The actual separator line */
  .separator-line {
    width: 100%;
    height: var(--separator-border-width, 0);
    background-color: var(--separator-border-color, transparent);
    /* Only show when width > 0px */
    display: var(--separator-display, none);
  }

  /* Day separator - Horizontal line between individual days
   * Used when days aren't at week or month boundaries */
  .separator {
    width: 100%;
    margin-left: 8px;
  }

  /* Week separator (full-width) - Used when show_week_numbers is null
   * Creates a horizontal line at week boundaries without week number pill
   * Margins are applied dynamically in createSeparatorStyle in render.ts */
  .week-separator {
    width: 100%;
    margin-left: 8px;
    border-top-style: solid; /* Ensure line is visible */
  }

  /* Month separator - Used at month boundaries
   * Creates a horizontal line between months, has priority over week separators
   * Margins are applied dynamically in createSeparatorStyle in render.ts */
  .month-separator {
    width: 100%;
    margin-left: 8px;
    border-top-style: solid; /* Ensure line is visible */
  }

  /* ===== DAY TABLE STYLES ===== */

  table {
    /* Layout */
    width: 100%;
    table-layout: fixed;
    border-spacing: 0;
    border-collapse: separate;

    /* Borders & Spacing */
    margin-bottom: var(--calendar-card-day-spacing);
  }

  .day-table {
    /* Override the default table border-bottom for day tables */
    border: none !important;
  }

  table:last-of-type {
    margin-bottom: 0;
    border-bottom: 0;
  }

  /* ===== DATE COLUMN STYLES ===== */

  .date-column {
    /* Layout */
    width: var(--calendar-card-date-column-width);
    min-width: var(--calendar-card-date-column-width);
    max-width: var(--calendar-card-date-column-width);
    vertical-align: var(--calendar-card-date-column-vertical-alignment);
    text-align: center;
    position: relative;

    /* Borders & Spacing */
    padding-left: 8px;
    padding-right: 12px;
  }

  .date-content {
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 2; /* Ensure date content is above indicator */
  }

  /* Today indicator styling */
  .today-indicator-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  /* Date components */
  .weekday {
    font-size: var(--calendar-card-font-size-weekday);
    line-height: var(--calendar-card-font-size-weekday);
    color: var(--calendar-card-color-weekday);
  }

  .day {
    font-size: var(--calendar-card-font-size-day);
    line-height: var(--calendar-card-font-size-day);
    font-weight: 500;
    color: var(--calendar-card-color-day);
  }

  .month {
    font-size: var(--calendar-card-font-size-month);
    line-height: var(--calendar-card-font-size-month);
    text-transform: uppercase;
    color: var(--calendar-card-color-month);
  }

  /* Today indicator styling */
  .today-indicator-container {
    position: absolute;
    color: var(--calendar-card-today-indicator-color);
    pointer-events: none;
    z-index: 1;
  }

  /* Set proper sizing for icon-based indicators */
  ha-icon.today-indicator {
    --mdc-icon-size: var(--calendar-card-today-indicator-size);
  }

  /* Special styling for image type */
  img.today-indicator.image {
    width: var(--calendar-card-today-indicator-size);
    height: auto;
    max-height: var(--calendar-card-today-indicator-size);
    object-fit: contain;
  }

  /* Special styling for emoji type */
  span.today-indicator.emoji {
    font-size: var(--calendar-card-today-indicator-size);
    line-height: 1;
  }

  /* Animation for pulse indicator */
  ha-icon.today-indicator.pulse {
    animation: pulse-animation 2s infinite ease-in-out;
  }

  /* Special styling for glow effect */
  ha-icon.today-indicator.glow {
    filter: drop-shadow(
      0 0 calc(var(--calendar-card-today-indicator-size) * 0.5)
        var(--calendar-card-today-indicator-color)
    );
  }

  /* Pulse animation keyframes */
  @keyframes pulse-animation {
    0% {
      transform: scale(0.95);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.7;
    }
  }

  /* Date column weather */
  .date-column .weather {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .weather ha-icon {
    margin-right: 1px;
  }

  .weather-temp-high,
  .weather-temp-low {
    line-height: 1;
    vertical-align: middle;
  }

  .weather-temp-high {
    font-weight: 500;
  }

  .weather-temp-low {
    opacity: 0.8;
  }

  /* ===== EVENT STYLES ===== */

  /* Base event */
  .event {
    padding: var(--calendar-card-event-spacing) 0 var(--calendar-card-event-spacing) 12px;
    border-radius: 0;
  }

  /* Event positioning variations */
  .event-first.event-last {
    border-radius: 0 var(--calendar-card-event-border-radius)
      var(--calendar-card-event-border-radius) 0;
  }

  .event-first {
    border-radius: 0 var(--calendar-card-event-border-radius) 0 0;
  }

  .event-middle {
    /* No additional styles needed */
  }

  .event-last {
    border-radius: 0 0 var(--calendar-card-event-border-radius) 0;
  }

  /* Past event styling */
  .past-event .event-content {
    opacity: 0.6;
  }

  /* Event content */
  .event-content {
    display: flex;
    flex-direction: column;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .summary {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .event-title {
    font-size: var(--calendar-card-font-size-event);
    font-weight: 500;
    line-height: 1.2;
    color: var(--calendar-card-color-event);
    margin-right: 12px;
    padding-bottom: 2px;
  }

  /* Text label styling */
  .calendar-label {
    display: inline;
    margin-right: 4px;
  }

  /* MDI icon label styling */
  .label-icon {
    --mdc-icon-size: var(--calendar-card-font-size-event);
    vertical-align: middle;
    margin-right: 4px;
  }

  /* Image label styling */
  .label-image {
    height: var(--calendar-card-font-size-event);
    width: auto;
    vertical-align: middle;
    margin-right: 4px;
  }

  /* Event weather */
  .event-weather {
    display: flex;
    font-weight: 500;
    margin-left: 8px;
    margin-right: 12px;
  }

  .event-weather ha-icon {
    margin-right: 2px;
  }

  /* ===== TIME & LOCATION STYLES ===== */

  .time-location {
    display: flex;
    flex-direction: column;
    margin-top: 0;
  }

  .time,
  .location {
    display: flex;
    align-items: center;
    line-height: 1.2;
    margin-top: 2px;
    margin-right: 12px;
  }

  .time span,
  .location span {
    display: inline-block;
    vertical-align: middle;
  }

  .time {
    font-size: var(--calendar-card-font-size-time);
    color: var(--calendar-card-color-time);
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .time-actual {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .time-countdown {
    text-align: right;
    color: var(--calendar-card-color-time);
    font-size: var(--calendar-card-font-size-time);
    margin-left: 8px;
    margin-right: 12px;
    white-space: nowrap;
  }

  .location {
    font-size: var(--calendar-card-font-size-location);
    color: var(--calendar-card-color-location);
  }

  /* ===== PROGRESS BAR STYLES ===== */

  .progress-bar {
    width: var(--calendar-card-progress-bar-width);
    height: var(--calendar-card-progress-bar-height);
    background-color: color-mix(in srgb, var(--calendar-card-progress-bar-color) 20%, transparent);
    border-radius: 999px;
    overflow: hidden;
    margin-left: 8px;
    margin-right: 12px;
  }

  .progress-bar-filled {
    height: 100%;
    background-color: var(--calendar-card-progress-bar-color);
    border-radius: 999px 0 0 999px;
  }

  /* ===== ICON STYLES ===== */

  ha-icon {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    position: relative;
    vertical-align: top;
    top: 0;
    margin-right: 4px;
  }

  .time ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-time, 14px);
  }

  .location ha-icon {
    --mdc-icon-size: var(--calendar-card-icon-size-location, 14px);
  }

  /* ===== STATUS MESSAGES ===== */

  .loading,
  .error {
    text-align: center;
    padding: 16px;
  }

  .error {
    color: var(--error-color);
  }
`;function Yn(e){e.style.opacity="0",e.style.transition=`opacity ${Ce}ms ease-out`,setTimeout((()=>{e.parentNode&&(e.parentNode.removeChild(e),at("Removed hold indicator"))}),Ce)}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const zn=1,Ln=2,jn=e=>(...t)=>({_$litDirective$:e,values:t});class En{constructor(e){}get _$isConnected(){return this._$parent._$isConnected}_$initialize(e,t,a){this.__part=e,this._$parent=t,this.__attributeIndex=a}_$resolve(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}}
/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Cn=jn(class extends En{constructor(e){if(super(e),e.type!==zn||"class"!==e.name||e.strings?.length>2)throw new Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(e){return" "+Object.keys(e).filter((t=>e[t])).join(" ")+" "}update(e,[t]){if(void 0===this._previousClasses){this._previousClasses=new Set,void 0!==e.strings&&(this._staticClasses=new Set(e.strings.join(" ").split(/\s/).filter((e=>""!==e))));for(const e in t)t[e]&&!this._staticClasses?.has(e)&&this._previousClasses.add(e);return this.render(t)}const a=e.element.classList;for(const e of this._previousClasses)e in t||(a.remove(e),this._previousClasses.delete(e));for(const e in t){const n=!!t[e];n===this._previousClasses.has(e)||this._staticClasses?.has(e)||(n?(a.add(e),this._previousClasses.add(e)):(a.remove(e),this._previousClasses.delete(e)))}return ee}}),Hn="important",Fn=" !"+Hn;
/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Vn=jn(class extends En{constructor(e){if(super(e),e.type!==zn||"style"!==e.name||e.strings?.length>2)throw new Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.")}render(e){return Object.keys(e).reduce(((t,a)=>{const n=e[a];return null==n?t:t+`${a=a.includes("-")?a:a.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g,"-$&").toLowerCase()}:${n};`}),"")}update(e,[t]){const{style:a}=e.element;if(void 0===this._previousStyleProperties)return this._previousStyleProperties=new Set(Object.keys(t)),this.render(t);for(const e of this._previousStyleProperties)null==t[e]&&(this._previousStyleProperties.delete(e),e.includes("-")?a.removeProperty(e):a[e]=null);for(const e in t){const n=t[e];if(null!=n){this._previousStyleProperties.add(e);const t="string"==typeof n&&n.endsWith(Fn);e.includes("-")||t?a.setProperty(e,t?n.slice(0,-11):n,t?Hn:""):a[e]=n}}return ee}}),{_ChildPart:On}=ge,An=window.ShadyDOM?.inUse&&!0===window.ShadyDOM?.noPatch?window.ShadyDOM.wrap:e=>e,Pn=()=>document.createComment(""),In=(e,t,a)=>{const n=An(e._$startNode).parentNode,i=void 0===t?e._$endNode:t._$startNode;if(void 0===a){const t=An(n).insertBefore(Pn(),i),r=An(n).insertBefore(Pn(),i);a=new On(t,r,e,e.options)}else{const t=An(a._$endNode).nextSibling,r=a._$parent,o=r!==e;if(o){let t;a._$reparentDisconnectables?.(e),a._$parent=e,void 0!==a._$notifyConnectionChanged&&(t=e._$isConnected)!==r._$isConnected&&a._$notifyConnectionChanged(t)}if(t!==i||o){let e=a._$startNode;for(;e!==t;){const t=An(e).nextSibling;An(n).insertBefore(e,i),e=t}}}return a},Nn=(e,t,a=e)=>(e._$setValue(t,a),e),Wn={},Un=e=>{e._$notifyConnectionChanged?.(!1,!0);let t=e._$startNode;const a=An(e._$endNode).nextSibling;for(;t!==a;){const e=An(t).nextSibling;An(t).remove(),t=e}},Bn=(e,t,a)=>{const n=new Map;for(let i=t;i<=a;i++)n.set(e[i],i);return n};
/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Rn=jn(class extends En{constructor(e){if(super(e),e.type!==Ln)throw new Error("repeat() can only be used in text expressions")}_getValuesAndKeys(e,t,a){let n;void 0===a?a=t:void 0!==t&&(n=t);const i=[],r=[];let o=0;for(const t of e)i[o]=n?n(t,o):o,r[o]=a(t,o),o++;return{values:r,keys:i}}render(e,t,a){return this._getValuesAndKeys(e,t,a).values}update(e,[t,a,n]){const i=e._$committedValue;const{values:r,keys:o}=this._getValuesAndKeys(t,a,n);if(!Array.isArray(i))return this._itemKeys=o,r;const s=this._itemKeys??=[],l=[];let d,_,c=0,h=i.length-1,u=0,m=r.length-1;for(;c<=h&&u<=m;)if(null===i[c])c++;else if(null===i[h])h--;else if(s[c]===o[u])l[u]=Nn(i[c],r[u]),c++,u++;else if(s[h]===o[m])l[m]=Nn(i[h],r[m]),h--,m--;else if(s[c]===o[m])l[m]=Nn(i[c],r[m]),In(e,l[m+1],i[c]),c++,m--;else if(s[h]===o[u])l[u]=Nn(i[h],r[u]),In(e,i[c],i[h]),h--,u++;else if(void 0===d&&(d=Bn(o,u,m),_=Bn(s,c,h)),d.has(s[c]))if(d.has(s[h])){const t=_.get(o[u]),a=void 0!==t?i[t]:null;if(null===a){const t=In(e,i[c]);Nn(t,r[u]),l[u]=t}else l[u]=Nn(a,r[u]),In(e,i[c],a),i[t]=null;u++}else Un(i[h]),h--;else Un(i[c]),c++;for(;u<=m;){const t=In(e,l[m+1]);Nn(t,r[u]),l[u++]=t}for(;c<=h;){const e=i[c++];null!==e&&Un(e)}return this._itemKeys=o,((e,t=Wn)=>{e._$committedValue=t})(e,l),ee}});function Kn(e,t){const a={};return e&&Array.isArray(e)?(e.forEach((e=>{if(!e.datetime)return;let n,i,r;"hourly"===t?(r=new Date(e.datetime),i=r.getHours(),n=`${Ga(r)}_${i}`):(r=new Date(e.datetime),n=Ga(r));const o=function(e,t){const a=void 0!==t&&(t>=18||t<6);if(a&&Zn[e])return Zn[e];return Jn[e]||"mdi:weather-cloudy-alert"}(e.condition,i);a[n]={icon:o,condition:e.condition,temperature:Math.round(e.temperature),templow:void 0!==e.templow?Math.round(e.templow):void 0,datetime:e.datetime,hour:i,precipitation:e.precipitation,precipitation_probability:e.precipitation_probability}})),a):a}const Jn={"clear-night":"mdi:weather-night",cloudy:"mdi:weather-cloudy",fog:"mdi:weather-fog",hail:"mdi:weather-hail",lightning:"mdi:weather-lightning","lightning-rainy":"mdi:weather-lightning-rainy",partlycloudy:"mdi:weather-partly-cloudy",pouring:"mdi:weather-pouring",rainy:"mdi:weather-rainy",snowy:"mdi:weather-snowy","snowy-rainy":"mdi:weather-snowy-rainy",sunny:"mdi:weather-sunny",windy:"mdi:weather-windy","windy-variant":"mdi:weather-windy-variant",exceptional:"mdi:weather-cloudy-alert"},Zn={sunny:"mdi:weather-night",partlycloudy:"mdi:weather-night-partly-cloudy","lightning-rainy":"mdi:weather-lightning"};function qn(e,t){const a=Tt(t);return"loading"===e?Q`
      <div class="calendar-card">
        <div class="loading">${a.loading}</div>
      </div>
    `:Q`
    <div class="calendar-card">
      <div class="error">${a.error}</div>
    </div>
  `}function Gn(e,t,a,n="day"){const i=parseFloat(a.day_spacing);if("day"===n)return{borderTopWidth:e,borderTopColor:t,borderTopStyle:"solid",marginTop:"0px",marginBottom:`${i}px`};let r=Fe.WEEK;"month"===n&&(r=Fe.MONTH);const o=i*r;return{borderTopWidth:e,borderTopColor:t,borderTopStyle:"solid",marginTop:`${o}px`,marginBottom:`${o}px`}}function Qn(e,t,a,n,i=!1,r="day"){if("0px"===e||i)return te;const o=Gn(e,t,n,r);return Q`<div class="${a}" style=${Vn(o)}></div>`}function Xn(e){return Qn(e.month_separator_width,e.month_separator_color,"month-separator",e,!1,"month")}function ei(e,t=!1){return Qn(e.week_separator_width,e.week_separator_color,"week-separator",e,t,"week")}function ti(e,t){if(!e.today_indicator||!t)return te;const a=e.today_indicator,n=function(e){if(void 0===e||!1===e)return"none";if(!0===e)return"dot";if("string"==typeof e)return"pulse"===e||"glow"===e?e:e.startsWith("mdi:")?"mdi":e.startsWith("/")||e.includes(".png")||e.includes(".jpg")||e.includes(".svg")||e.includes(".webp")||e.includes(".gif")?"image":/[\p{Emoji}]/u.test(e)?"emoji":"dot";return"none"}(a);if("none"===n)return te;const i=function(e){const t={position:"absolute",transform:"translate(-50%, -50%)"},a=e.trim().split(/\s+/);return a.length>=1&&(t.left=a[0]),a.length>=2?t.top=a[1]:t.top="50%",t}(e.today_indicator_position);return Q`
    <div class="today-indicator-container">
      ${function(e,t,a){let n="";switch(e){case"dot":case"pulse":case"glow":n="mdi:circle";break;case"mdi":n="string"==typeof t?t:"mdi:circle";break;case"image":return"string"==typeof t?Q`
          <img 
            src="${t}" 
            class="today-indicator image"
            style=${Vn(a)}
            alt="Today">
          </img>`:te;case"emoji":return"string"==typeof t?Q` <span class="today-indicator emoji" style=${Vn(a)}>
          ${t}
        </span>`:te;default:return te}if(n)return Q` <ha-icon
      icon="${n}"
      class="today-indicator ${e}"
      style=${Vn(a)}
    >
    </ha-icon>`;return te}(n,a,i)}
    </div>
  `}function ai(e,t,a,n,i){var r,o,s,l;const d=0===e.getDay()||6===e.getDay();let _=t.weekday_color,c=t.day_color,h=t.month_color;d&&(_=t.weekend_weekday_color||_,c=t.weekend_day_color||c,h=t.weekend_month_color||h),n&&(_=t.today_weekday_color||_,c=t.today_day_color||c,h=t.today_month_color||h);const u=Tt(a),m=u.daysOfWeek[e.getDay()],g=e.getDate(),p=u.months[e.getMonth()],f=("date"===(null==(r=t.weather)?void 0:r.position)||"both"===(null==(o=t.weather)?void 0:o.position))&&(null==(s=t.weather)?void 0:s.entity);let y=te;if(f&&(null==i?void 0:i.daily)){const a=function(e,t){if(!t)return;return t[Ga(e)]}(e,i.daily);if(a){const e=(null==(l=t.weather)?void 0:l.date)||{},n=!1!==e.show_conditions,i=!1!==e.show_high_temp,r=!0===e.show_low_temp&&void 0!==a.templow,o=e.icon_size||"14px",s=e.font_size||"12px",d=e.color||"var(--primary-text-color)";y=Q`
        <div class="weather" style="font-size: ${s}; color: ${d};">
          ${n?Q`
                <ha-icon
                  .icon=${a.icon}
                  style="--mdc-icon-size: ${o};"
                ></ha-icon>
              `:te}
          ${i?Q` <span class="weather-temp-high">${a.temperature}°</span> `:te}
          ${r?Q` <span class="weather-temp-low">/${a.templow}°</span> `:te}
        </div>
      `}}return Q`
    <div
      class="weekday"
      style=${Vn({"font-size":t.weekday_font_size,color:_})}
    >
      ${m}
    </div>
    <div
      class="day"
      style=${Vn({"font-size":t.day_font_size,color:c})}
    >
      ${g}
    </div>
    ${t.show_month?Q`
          <div
            class="month"
            style=${Vn({"font-size":t.month_font_size,color:h})}
          >
            ${p}
          </div>
        `:te}
    ${y}
  `}function ni(e,t,a,n,i,r,o){const s=new Date,l=new Date(s.getFullYear(),s.getMonth(),s.getDate()),d=new Date(e.timestamp).toDateString(),_=d===l.toDateString(),c=new Date(l);c.setDate(c.getDate()+1);const h=d===c.toDateString();let u=te;const m=(null==i?void 0:i.isNewMonth)||!1,g=(null==i?void 0:i.isNewWeek)||!1,p=m&&"0px"!==t.month_separator_width,f=g&&(null!==t.show_week_numbers||"0px"!==t.week_separator_width),y=t.day_separator_width,v=t.day_separator_color;if(n&&"0px"!==y&&!p&&!f){const e=Gn(y,v,t,"day");u=Q`<div class="separator" style=${Vn(e)}></div>`}return Q`
    ${u}
    <table
      class=${Cn({"day-table":!0,today:_,tomorrow:h,"future-day":!_})}
    >
      ${Rn(e.events,((e,t)=>`${e._entityId}-${e.summary}-${t}`),((n,i)=>function(e,t,a,n,i,r,o,s){var l,d;const _=Boolean(e._isEmptyDay),c=new Date(t.timestamp),h=function(e){const t=e.getDay();return 0===t||6===t}(c),u=new Date,m=new Date(u.getFullYear(),u.getMonth(),u.getDate()),g=new Date(m);g.setDate(g.getDate()+1);let p=!1;if(!_){if(!e.start.dateTime){let t=e.end.date?qa(e.end.date):null;if(t){const e=new Date(t);e.setDate(e.getDate()-1),t=e}p=null!==t&&m>t}else{const t=e.end.dateTime?new Date(e.end.dateTime):null;p=null!==t&&u>t}}const f=yn(e._entityId,n,void 0,e),y=n.event_background_opacity>0?n.event_background_opacity:0,v=y>0?yn(e._entityId,n,y,e):"",w=null!=(l=wn(e._entityId,"show_time",n,e))?l:n.show_time,k=null!=(d=wn(e._entityId,"show_location",n,e))?d:n.show_location,b=!e.start.dateTime,M=b&&e.time&&(e.time.includes(Tt(i).multiDay)||e.time.includes(Tt(i).endsTomorrow)||e.time.includes(Tt(i).endsToday)),T=w&&!(b&&!M&&!n.show_single_allday_time)&&!_;let $=null;!n.show_countdown||_||p||($=Ka(e,i));const D=kn(e),S=D&&n.show_progress_bar?function(e){if(!kn(e))return null;const t=new Date,a=new Date(e.start.dateTime),n=new Date(e.end.dateTime).getTime()-a.getTime(),i=t.getTime()-a.getTime();return Math.min(100,Math.max(0,Math.floor(i/n*100)))}(e):null,x=Ra(e,n,i,s),Y=e.location&&k?Ja(e.location,n.remove_location_country):"",z=0===a,L=a===t.events.length-1,j={event:!0,"event-first":z,"event-middle":!z&&!L,"event-last":L,"past-event":p};return Q`
    <tr>
      ${0===a?Q`
            <td
              class="date-column ${h?"weekend":""}"
              rowspan="${t.events.length}"
              style="position: relative;"
            >
              ${ai(c,n,i,r,o)}
              ${ti(n,r)}
            </td>
          `:""}
      <td
        class=${Cn(j)}
        style="border-left: var(--calendar-card-line-width-vertical) solid ${f}; background-color: ${v};"
      >
        <div class="event-content">
          ${function(e,t,a){var n;const i=!!e._isEmptyDay,r=i?"var(--calendar-card-empty-day-color)":(null==(n=e._matchedConfig)?void 0:n.color)||t.event_color;return Q`
    <div class="summary-row">
      <div class="summary">
        ${vn(e._entityId,t,e)?(o=vn(e._entityId,t,e),o?o.startsWith("mdi:")?Q`<ha-icon icon="${o}" class="label-icon"> </ha-icon>`:o.startsWith("/local/")||/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(o)?Q`<img src="${o}" class="label-image"> </img>`:Q`<span class="calendar-label">${o}</span>`:te):""}
        <span
          class="event-title ${i?"empty-day-title":""}"
          style="color: ${r}"
        >
          ${i?`✓ ${e.summary}`:e.summary}
        </span>
      </div>
      ${function(e,t,a){var n,i,r;const o=(null==(n=t.weather)?void 0:n.entity)&&("event"===t.weather.position||"both"===t.weather.position);if(!o||!(null==a?void 0:a.hourly))return Q``;if(null==(i=e.end)?void 0:i.dateTime){const t=new Date;if(new Date(e.end.dateTime)<t)return Q``}const s=function(e,t,a){if(e.start.date&&!e.start.dateTime&&a)return a[Ga(qa(e.start.date))];if(!e.start.dateTime||!t)return;const n=new Date(e.start.dateTime),i=Ga(n),r=n.getHours(),o=t[`${i}_${r}`];if(o)return o;let s=-1,l=24;return Object.keys(t).forEach((e=>{if(e.startsWith(i)){const t=e.split("_")[1],a=parseInt(t);if(!isNaN(a)){const e=Math.abs(a-r);e<l&&(l=e,s=a)}}})),s>=0?t[`${i}_${s}`]:void 0}(e,a.hourly,a.daily);if(!s)return Q``;const l=(null==(r=t.weather)?void 0:r.event)||{},d=!1!==l.show_conditions,_=!1!==l.show_temp,c=l.icon_size||"14px",h=l.font_size||"12px",u=l.color||"var(--secondary-text-color)";return Q`
    <div class="event-weather">
      ${d?Q`<ha-icon .icon=${s.icon} style="--mdc-icon-size: ${c};"></ha-icon>`:te}
      ${_?Q`<span style="font-size: ${h}; color: ${u};">
            ${s.temperature}°
          </span>`:te}
    </div>
  `}(e,t,a)}
    </div>
  `;var o}(e,n,o)}
          <div class="time-location">
            ${T?Q`
                  <div class="time">
                    <div class="time-actual">
                      <ha-icon icon="mdi:clock-outline"></ha-icon>
                      <span>${x}</span>
                    </div>
                    ${$?Q`<div class="time-countdown">${$}</div>`:null!==S&&n.show_progress_bar?Q`
                            <div class="progress-bar">
                              <div
                                class="progress-bar-filled"
                                style="width: ${S}%"
                              ></div>
                            </div>
                          `:te}
                  </div>
                `:$?Q`
                    <div class="time">
                      <div class="time-actual"></div>
                      <div class="time-countdown">${$}</div>
                    </div>
                  `:null!==S&&n.show_progress_bar?Q`
                      <div class="time">
                        <div class="time-actual"></div>
                        <div class="progress-bar">
                          <div
                            class="progress-bar-filled"
                            style="width: ${S}%"
                          ></div>
                        </div>
                      </div>
                    `:te}
            ${Y?Q`
                  <div class="location">
                    <ha-icon icon="mdi:map-marker"></ha-icon>
                    <span>${Y}</span>
                  </div>
                `:""}
          </div>
        </div>
      </td>
    </tr>
  `}(n,e,i,t,a,_,r,o)))}
    </table>
  `}function ii(e,t,a,n,i){return Q`
    ${e.map(((r,o)=>{var s;const l=o>0?e[o-1]:void 0,d=null!=(s=r.weekNumber)?s:null;let _=!1;if(l){_=r.weekNumber!==l.weekNumber}else _=!0;const c=l&&r.monthNumber!==l.monthNumber,h=0===o,u={isNewWeek:_,isNewMonth:Boolean(c)};let m=te;return!c||"0px"===t.month_separator_width||_&&null!==t.show_week_numbers?_&&(m=h&&null!==t.show_week_numbers&&!t.show_current_week_number?c?Xn(t):ei(t,h):null!==t.show_week_numbers?function(e,t,a,n=!1){if(null===e)return te;const i=parseFloat(a.day_spacing),r=i*(t?Fe.MONTH:Fe.WEEK)/2,o={marginTop:(n?0:r-i)+"px",marginBottom:`${r}px`},s={};return n?s["--separator-display"]="none":t&&"0px"!==a.month_separator_width?(s["--separator-border-width"]=a.month_separator_width,s["--separator-border-color"]=a.month_separator_color,s["--separator-display"]="block"):"0px"!==a.week_separator_width?(s["--separator-border-width"]=a.week_separator_width,s["--separator-border-color"]=a.week_separator_color,s["--separator-display"]="block"):s["--separator-display"]="none",Q`
    <table class="week-row-table" style=${Vn(o)}>
      <tr>
        <td class="week-number-cell">
          <div class="week-number">${e}</div>
        </td>
        <td class="separator-cell" style=${Vn(s)}>
          <div class="separator-line"></div>
        </td>
      </tr>
    </table>
  `}(d,Boolean(c),t,h):ei(t,h)):m=Xn(t),Q`
        ${m}
        ${ni(r,t,a,l,u,n,i)}
      `}))}
  `}var ri=r`
  ha-textfield,
  ha-select,
  ha-formfield,
  ha-entity-picker,
  ha-icon-picker {
    display: block;
    margin: 8px 0;
  }

  .card-config {
    display: flex;
    flex-direction: column;
    padding: 4px 0;
  }

  .helper-text {
    color: var(--secondary-text-color);
    font-size: 10px;
    line-height: 1.1;
    margin-top: -4px;
    margin-bottom: 8px;
  }

  h3 {
    margin: 24px 0 6px 0;
    font-size: 14px;
  }

  h3:first-of-type {
    margin-top: 8px;
  }

  h4 {
    margin: 24px 0 6px 0;
  }

  h5 {
    margin: 2px 0 0 0;
  }

  .panel-content {
    padding: 8px 0 12px 0;
  }

  .action-config {
    display: flex;
    flex-direction: column;
  }

  ha-expansion-panel {
    margin: 8px 0;
  }

  ha-button {
    margin: 8px 0;
  }

  .indicator-field {
    display: flex;
    flex-direction: column;
    margin: 8px 0;
  }

  ha-formfield {
    display: flex;
    align-items: center;
    padding: 8px 0;
  }

  .date-input {
    position: relative;
    margin-bottom: 16px;
    width: 100%;
  }

  .date-input .mdc-text-field {
    width: 100%;
    height: 56px;
    border-radius: 4px 4px 0 0;
    padding: 0;
    background-color: var(
      --mdc-text-field-fill-color,
      var(--input-fill-color, rgba(var(--rgb-primary-text-color), 0.06))
    );
    border-bottom: 1px solid var(--mdc-text-field-idle-line-color, var(--secondary-text-color));
    transition:
      background-color 15ms linear,
      border-bottom-color 15ms linear;
    box-sizing: border-box;
    position: relative;
    overflow: hidden; /* Important for containing the ripple */
  }

  .date-input .mdc-text-field__ripple {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    opacity: 0; /* Hidden by default */
    background-color: var(--mdc-ripple-color, var(--primary-text-color));
    transition:
      opacity 15ms linear,
      background-color 15ms linear;
    z-index: 1;
  }

  .date-input .mdc-floating-label {
    position: absolute;
    top: 8px;
    left: 4px;
    -webkit-font-smoothing: antialiased;
    font-family: var(
      --mdc-typography-subtitle1-font-family,
      var(--mdc-typography-font-family, Roboto, sans-serif)
    );
    font-size: var(--mdc-typography-subtitle1-font-size, 1rem);
    font-weight: var(--mdc-typography-subtitle1-font-weight, 400);
    letter-spacing: var(--mdc-typography-subtitle1-letter-spacing, 0.009375em);
    text-transform: var(--mdc-typography-subtitle1-text-transform, inherit);
    transform: scale(0.75);
    color: var(--mdc-select-label-ink-color, rgba(0, 0, 0, 0.6));
    pointer-events: none;
    transition: color 15ms linear;
    z-index: 2;
  }

  .date-input .value-container {
    display: flex;
    align-items: center;
    height: 100%;
    padding: 8px 16px 8px;
    position: relative;
    z-index: 2;
  }

  .date-input .value-text {
    -webkit-font-smoothing: antialiased;
    font-family: var(
      --mdc-typography-subtitle1-font-family,
      var(--mdc-typography-font-family, Roboto, sans-serif)
    );
    font-size: var(--mdc-typography-subtitle1-font-size, 1rem);
    line-height: var(--mdc-typography-subtitle1-line-height, 1.75rem);
    font-weight: var(--mdc-typography-subtitle1-font-weight, 400);
    letter-spacing: var(--mdc-typography-subtitle1-letter-spacing, 0.009375em);
    text-transform: var(--mdc-typography-subtitle1-text-transform, inherit);
    color: var(--primary-text-color);
  }

  .date-input input[type='date'] {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    z-index: 3;
  }

  /* Handle focus and hover states with JavaScript toggling classes */
  .date-input .mdc-text-field.focused {
    border-bottom: 2px solid var(--primary-color);
  }

  .date-input .mdc-text-field.focused .mdc-floating-label {
    color: var(--primary-color);
  }
`,oi=Object.defineProperty,si=Object.getOwnPropertySymbols,li=Object.prototype.hasOwnProperty,di=Object.prototype.propertyIsEnumerable,_i=(e,t,a)=>t in e?oi(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a,ci=(e,t)=>{for(var a in t||(t={}))li.call(t,a)&&_i(e,a,t[a]);if(si)for(var a of si(t))di.call(t,a)&&_i(e,a,t[a]);return e},hi=(e,t,a,n)=>{for(var i,r=void 0,o=e.length-1;o>=0;o--)(i=e[o])&&(r=i(t,a,r)||r);return r&&oi(t,a,r),r};const ui={max_events_to_show:"compact_events_to_show",vertical_line_color:"accent_color",horizontal_line_width:"day_separator_width",horizontal_line_color:"day_separator_color"},mi={max_events_to_show:"compact_events_to_show"};class gi extends ve{static get styles(){return ri}connectedCallback(){super.connectedCallback(),this._loadCustomElements()}async _loadCustomElements(){if(!customElements.get("ha-entity-picker"))try{const e=customElements.get("hui-entities-card");e&&"function"==typeof e.getConfigElement?await e.getConfigElement():console.warn("Could not load ha-entity-picker: getConfigElement not available")}catch(e){console.warn("Could not load ha-entity-picker",e)}}setConfig(e){this._config=ci(ci({},rt),e)}getConfigValue(e,t){var a;if(!this._config)return t;if(!e.includes(".")){let n=null!=(a=this._config[e])?a:t;if("time_24h"===e){if(!0===n)return"true";if(!1===n)return"false"}return n}const n=e.split(".");let i=this._config;for(const e of n){if(null==i)return t;if(/^\d+$/.test(e)){const a=parseInt(e,10);if(Array.isArray(i)&&a>=0&&a<i.length){i=i[a];continue}return t}if("object"!=typeof i||null===i||!(e in i))return t;i=i[e]}return null!=i?i:t}setConfigValue(e,t){if(!this._config)return;"time_24h"===e&&("true"===t?t=!0:"false"===t&&(t=!1));const a=JSON.parse(JSON.stringify(this._config));if(!e.includes("."))return void 0===t?delete a[e]:a[e]=t,void this._fireConfigChanged(a);const n=e.split("."),i=n.pop();let r=a;for(const e of n)if(/^\d+$/.test(e)){const t=parseInt(e,10);for(Array.isArray(r)||(r=[]);r.length<=t;)r.push({});r[t]&&"object"==typeof r[t]||(r[t]={}),r=r[t]}else Object.prototype.hasOwnProperty.call(r,e)&&"object"==typeof r[e]||(r[e]={}),r=r[e];void 0===t?delete r[i]:r[i]=t,this._fireConfigChanged(a)}_fireConfigChanged(e){const t=zt(e,rt);this._config=e,this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:t}}))}_findDeprecatedParams(e){return Object.keys(ui).filter((t=>t in e))}_findDeprecatedEntityParams(e){const t=[];return e.forEach(((e,a)=>{"object"==typeof e&&null!==e&&Object.keys(mi).forEach((n=>{n in e&&t.push({index:a,param:n})}))})),t}_upgradeConfig(){const e=ci({},this._config);let t=!1;for(const[a,n]of Object.entries(ui))a in e&&(e[n]=e[a],delete e[a],t=!0);Array.isArray(e.entities)&&(e.entities=e.entities.map((e=>{if("object"==typeof e&&null!==e){const a=ci({},e);for(const[e,n]of Object.entries(mi))e in a&&(a[n]=a[e],delete a[e],t=!0);return a}return e}))),t&&this._fireConfigChanged(e)}_getTranslation(e){var t,a,n;const i=(null==(t=this._config)?void 0:t.language)||(null==(n=null==(a=this.hass)?void 0:a.locale)?void 0:n.language)||"en",r=e.includes(".")?e:`editor.${e}`;return function(e,t,a){const n=Tt(e);if("string"==typeof t&&t.includes(".")){const[e,i]=t.split(".");if("editor"===e&&n.editor&&i in n.editor){const e=n.editor[i];if("string"==typeof e||Array.isArray(e))return e}return void 0!==a?a:i}if(t in n){const e=n[t];if("string"==typeof e||Array.isArray(e))return e}return void 0!==a?a:t}(r.startsWith("editor.")&&!function(e){const t=Tt(e);return Boolean((null==t?void 0:t.editor)&&Object.keys(t.editor).length>0)}(i)?"en":i,r,e)}_valueChanged(e){if(!e.target)return;e.stopPropagation();const t=e.target,a=t.getAttribute("name");let n=t.value;if(a)if("language_mode"!==a){if("height_mode"===a){const e=t.value,a=this.getConfigValue("height"),n=this.getConfigValue("max_height");return this.setConfigValue("height",void 0),this.setConfigValue("max_height",void 0),void("fixed"===e?this.setConfigValue("height",a&&"auto"!==a?a:"300px"):"maximum"===e&&this.setConfigValue("max_height",n&&"none"!==n?n:"300px"))}if("start_date_mode"!==a)return"start_date_fixed"===a||"start_date_offset"===a?(this.setConfigValue("start_date",t.value),void this.requestUpdate()):void("remove_location_country_selector"!==a&&("show_week_numbers"===a&&"null"===n&&(n=null),"HA-SWITCH"===t.tagName&&(n=t.checked),"number"===t.getAttribute("type")&&""!==n&&(n=parseFloat(n)),this.setConfigValue(a,n)));this._handleStartDateModeChange(t.value)}else{const e=t.value;"system"===e?this.setConfigValue("language",void 0):"custom"===e&&(this.getConfigValue("language")||this.setConfigValue("language","en"))}}_serviceDataChanged(e){if(!e.target)return;const t=e.target,a=t.getAttribute("name");if(!a)return;let n=t.value;try{n=n?JSON.parse(n):{},this.setConfigValue(a,n)}catch(e){}}_getStartDateMode(){const e=this.getConfigValue("start_date",""),t=null!=e?String(e):"";return t&&""!==t?/^\d{4}-\d{2}-\d{2}$/.test(t)?"fixed":/^[+-]?\d+$/.test(t)?"offset":"fixed":"default"}_getStartDateValue(e){const t=this.getConfigValue("start_date",""),a=null!=t?String(t):"";return"fixed"===e&&/^\d{4}-\d{2}-\d{2}$/.test(a)||"offset"===e&&/^[+-]?\d+$/.test(a)?a:""}_handleStartDateModeChange(e){if("default"===e)this.setConfigValue("start_date",void 0);else if("fixed"===e){const e=new Date,t=e.getFullYear(),a=String(e.getMonth()+1).padStart(2,"0"),n=String(e.getDate()).padStart(2,"0");this.setConfigValue("start_date",`${t}-${a}-${n}`)}else"offset"===e&&this.setConfigValue("start_date","+0")}render(){var e,t;if(!this.hass||!this._config)return Q``;const a=this._findDeprecatedParams(this._config),n=this._findDeprecatedEntityParams(null!=(t=null==(e=this._config)?void 0:e.entities)?t:[]),i=a.length>0||n.length>0?Q`
          <div style="border-radius: 8px; overflow: hidden;">
            <ha-alert alert-type="warning">
              <div style="height: 6px"></div>
              <b>${this._getTranslation("editor.deprecated_config_detected")}</b><br />
              ${this._getTranslation("editor.deprecated_config_explanation")}<br />
              <span style="color: var(--warning-color); font-size: 0.95em;">
                ${this._getTranslation("editor.deprecated_config_update_hint")}
              </span>
              <div style="text-align:center;">
                <ha-button @click="${()=>this._upgradeConfig()}">
                  <ha-icon icon="mdi:autorenew"></ha-icon>
                  ${this._getTranslation("editor.update_config")}
                </ha-button>
              </div>
            </ha-alert>
          </div>
        `:null;return Q`
      ${i}
      <div class="card-config">
        <!-- CALENDAR ENTITIES -->
        ${this.addExpansionPanel(this._getTranslation("calendar_entities"),"M21,17V8H7V17H21M21,3A2,2 0 0,1 23,5V17A2,2 0 0,1 21,19H7C5.89,19 5,18.1 5,17V5A2,2 0 0,1 7,3H8V1H10V3H18V1H20V3H21M3,21H17V23H3C1.89,23 1,22.1 1,21V9H3V21M19,15H15V11H19V15Z",Q` ${this._renderCalendarEntities()} `,!0)}

        <!-- CORE SETTINGS -->
        ${this.addExpansionPanel(this._getTranslation("core_settings"),"M9,10V12H7V10H9M13,10V12H11V10H13M17,10V12H15V10H17M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5A2,2 0 0,1 5,3H6V1H8V3H16V1H18V3H19M19,19V8H5V19H19M9,14V16H7V14H9M13,14V16H11V14H13M17,14V16H15V14H17Z",Q`
            <!-- Display Range -->
            <h3>${this._getTranslation("time_range")}</h3>
            <div class="helper-text">${this._getTranslation("time_range_note")}</div>
            ${this.addTextField("days_to_show",this._getTranslation("days_to_show"),"number")}
            <div class="helper-text">${this._getTranslation("days_to_show_note")}</div>
            ${this.addSelectField("start_date_mode",this._getTranslation("start_date_mode"),[{value:"default",label:this._getTranslation("start_date_mode_default")},{value:"fixed",label:this._getTranslation("start_date_mode_fixed")},{value:"offset",label:this._getTranslation("start_date_mode_offset")}],!1,String(this._getStartDateMode()),(e=>{this._handleStartDateModeChange(e),this.requestUpdate()}))}
            ${(()=>{const e=this._getStartDateMode();return"fixed"===e?this.addDateField("start_date_fixed",this._getTranslation("start_date_fixed"),this._getStartDateValue("fixed")):"offset"===e?Q`
                  ${this.addTextField("start_date_offset",this._getTranslation("start_date_offset"),"text",this._getStartDateValue("offset"))}
                  <div class="helper-text">${this._getTranslation("start_date_offset_note")}</div>
                `:Q``})()}

            <!-- Compact Mode -->
            <h3>${this._getTranslation("compact_mode")}</h3>
            <div class="helper-text">${this._getTranslation("compact_mode_note")}</div>
            ${this.addTextField("compact_days_to_show",this._getTranslation("compact_days_to_show"),"number")}
            ${this.addTextField("compact_events_to_show",this._getTranslation("compact_events_to_show"),"number")}
            ${this.addBooleanField("compact_events_complete_days",this._getTranslation("compact_events_complete_days"))}
            <div class="helper-text">
              ${this._getTranslation("compact_events_complete_days_note")}
            </div>

            <!-- Event Visibility -->
            <h3>${this._getTranslation("event_visibility")}</h3>
            ${this.addBooleanField("show_past_events",this._getTranslation("show_past_events"))}
            ${this.addBooleanField("show_empty_days",this._getTranslation("show_empty_days"))}
            ${this.addBooleanField("filter_duplicates",this._getTranslation("filter_duplicates"))}

            <!-- Language & Time Formats -->
            <h3>${this._getTranslation("language_time_formats")}</h3>
            ${this.addSelectField("language_mode",this._getTranslation("language_mode"),[{value:"system",label:this._getTranslation("system")},{value:"custom",label:this._getTranslation("custom")}],!1,void 0!==this.getConfigValue("language")?"custom":"system")}
            ${(()=>void 0!==this.getConfigValue("language")?Q`
                    ${this.addTextField("language",this._getTranslation("language_code"))}
                    <div class="helper-text">${this._getTranslation("language_code_note")}</div>
                  `:Q``)()}
            ${this.addSelectField("time_24h",this._getTranslation("time_24h"),[{value:"system",label:this._getTranslation("system")},{value:"true",label:this._getTranslation("24h")},{value:"false",label:this._getTranslation("12h")}])}
          `)}

        <!-- APPEARANCE & LAYOUT -->
        ${this.addExpansionPanel(this._getTranslation("appearance_layout"),"M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z",Q`
            <!-- Title Styling -->
            <h3>${this._getTranslation("title_styling")}</h3>
            ${this.addTextField("title",this._getTranslation("title"))}
            ${this.addTextField("title_font_size",this._getTranslation("title_font_size"))}
            ${this.addTextField("title_color",this._getTranslation("title_color"))}

            <!-- Card Styling -->
            <h3>${this._getTranslation("card_styling")}</h3>
            ${this.addTextField("background_color",this._getTranslation("background_color"))}
            ${this.addSelectField("height_mode",this._getTranslation("height_mode"),[{value:"auto",label:this._getTranslation("auto")},{value:"fixed",label:this._getTranslation("fixed")},{value:"maximum",label:this._getTranslation("maximum")}],!1,(()=>void 0!==this.getConfigValue("height")&&"auto"!==this.getConfigValue("height")?"fixed":void 0!==this.getConfigValue("max_height")&&"none"!==this.getConfigValue("max_height")?"maximum":"auto")())}
            ${(()=>void 0!==this.getConfigValue("height")&&"auto"!==this.getConfigValue("height")?Q`
                  ${this.addTextField("height",this._getTranslation("height_value"))}
                  <div class="helper-text">${this._getTranslation("fixed_height_note")}</div>
                `:void 0!==this.getConfigValue("max_height")&&"none"!==this.getConfigValue("max_height")?Q`
                  ${this.addTextField("max_height",this._getTranslation("height_value"))}
                  <div class="helper-text">${this._getTranslation("max_height_note")}</div>
                `:Q``)()}

            <!-- Event Styling -->
            <h3>${this._getTranslation("event_styling")}</h3>
            ${this.addTextField("accent_color",this._getTranslation("accent_color"))}
            ${this.addTextField("event_background_opacity",this._getTranslation("event_background_opacity"),"number")}
            ${this.addTextField("vertical_line_width",this._getTranslation("vertical_line_width"))}

            <!-- Spacing & Alignment -->
            <h3>${this._getTranslation("spacing_alignment")}</h3>
            ${this.addTextField("day_spacing",this._getTranslation("day_spacing"))}
            ${this.addTextField("event_spacing",this._getTranslation("event_spacing"))}
            ${this.addTextField("additional_card_spacing",this._getTranslation("additional_card_spacing"))}
          `)}

        <!-- DATE DISPLAY -->
        ${this.addExpansionPanel(this._getTranslation("date_display"),"M7,10H12V15H7M19,19H5V8H19M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3Z",Q`
            <!-- Date Column Formatting -->
            <h3>${this._getTranslation("vertical_alignment")}</h3>
            ${this.addSelectField("date_vertical_alignment",this._getTranslation("date_vertical_alignment"),[{value:"top",label:this._getTranslation("top")},{value:"middle",label:this._getTranslation("middle")},{value:"bottom",label:this._getTranslation("bottom")}])}

            <!-- Date Column Formatting -->
            <h3>${this._getTranslation("date_formatting")}</h3>

            <!-- Weekday Formatting -->
            <h5>${this._getTranslation("weekday_font")}</h5>
            ${this.addTextField("weekday_font_size",this._getTranslation("weekday_font_size"))}
            ${this.addTextField("weekday_color",this._getTranslation("weekday_color"))}

            <!-- Day Formatting -->
            <h5>${this._getTranslation("day_font")}</h5>
            ${this.addTextField("day_font_size",this._getTranslation("day_font_size"))}
            ${this.addTextField("day_color",this._getTranslation("day_color"))}

            <!-- Month Formatting -->
            <h5>${this._getTranslation("month_font")}</h5>
            ${this.addBooleanField("show_month",this._getTranslation("show_month"))}
            ${this.addTextField("month_font_size",this._getTranslation("month_font_size"))}
            ${this.addTextField("month_color",this._getTranslation("month_color"))}

            <!-- Weekend Highlighting -->
            <h5>${this._getTranslation("weekend_highlighting")}</h5>
            ${this.addTextField("weekend_weekday_color",this._getTranslation("weekend_weekday_color"))}
            ${this.addTextField("weekend_day_color",this._getTranslation("weekend_day_color"))}
            ${this.addTextField("weekend_month_color",this._getTranslation("weekend_month_color"))}

            <!-- Today Highlighting -->
            <h5>${this._getTranslation("today_highlighting")}</h5>
            ${this.addTextField("today_weekday_color",this._getTranslation("today_weekday_color"))}
            ${this.addTextField("today_day_color",this._getTranslation("today_day_color"))}
            ${this.addTextField("today_month_color",this._getTranslation("today_month_color"))}

            <!-- Today Indicator -->
            <h3>${this._getTranslation("today_indicator")}</h3>
            ${this.addTodayIndicatorField("today_indicator",this._getTranslation("today_indicator"))}
            ${(()=>{const e=this.getConfigValue("today_indicator");return e&&"none"!==e?Q`
                  ${this.addTextField("today_indicator_position",this._getTranslation("today_indicator_position"))}
                  ${this.addTextField("today_indicator_color",this._getTranslation("today_indicator_color"))}
                  ${this.addTextField("today_indicator_size",this._getTranslation("today_indicator_size"))}
                `:Q``})()}

            <!-- Week Numbers & Separators -->
            <h3>${this._getTranslation("week_numbers_separators")}</h3>

            <!-- Week Numbers -->
            <h5>${this._getTranslation("week_numbers")}</h5>
            ${this.addSelectField("first_day_of_week",this._getTranslation("first_day_of_week"),[{value:"system",label:this._getTranslation("system")},{value:"sunday",label:this._getTranslation("sunday")},{value:"monday",label:this._getTranslation("monday")}])}
            ${this.addSelectField("show_week_numbers",this._getTranslation("show_week_numbers"),[{value:"null",label:this._getTranslation("none")},{value:"iso",label:"ISO"},{value:"simple",label:this._getTranslation("simple")}])}
            ${(()=>{const e=this.getConfigValue("show_week_numbers");return"iso"===e?Q`<div class="helper-text">
                  ${this._getTranslation("week_number_note_iso")}
                </div>`:"simple"===e?Q`<div class="helper-text">
                  ${this._getTranslation("week_number_note_simple")}
                </div>`:Q``})()}
            ${(()=>{const e=this.getConfigValue("show_week_numbers");return e&&"null"!==e?Q`
                  ${this.addBooleanField("show_current_week_number",this._getTranslation("show_current_week_number"))}
                  ${this.addTextField("week_number_font_size",this._getTranslation("week_number_font_size"))}
                  ${this.addTextField("week_number_color",this._getTranslation("week_number_color"))}
                  ${this.addTextField("week_number_background_color",this._getTranslation("week_number_background_color"))}
                `:Q``})()}

            <!-- Day Separator -->
            <h5>${this._getTranslation("day_separator")}</h5>
            ${this.addBooleanField("day_separator_toggle",this._getTranslation("show_day_separator"),"0px"!==this.getConfigValue("day_separator_width")&&"0"!==this.getConfigValue("day_separator_width"),(e=>{e.target.checked?this.setConfigValue("day_separator_width","1px"):this.setConfigValue("day_separator_width","0px")}),!0)}
            ${(()=>"0px"!==this.getConfigValue("day_separator_width")&&"0"!==this.getConfigValue("day_separator_width")?Q`
                ${this.addTextField("day_separator_width",this._getTranslation("day_separator_width"))}
                ${this.addTextField("day_separator_color",this._getTranslation("day_separator_color"))}
              `:Q``)()}

            <!-- Week Separator -->
            <h5>${this._getTranslation("week_separator")}</h5>
            ${this.addBooleanField("week_separator_toggle",this._getTranslation("show_week_separator"),"0px"!==this.getConfigValue("week_separator_width")&&"0"!==this.getConfigValue("week_separator_width"),(e=>{e.target.checked?this.setConfigValue("week_separator_width","1px"):this.setConfigValue("week_separator_width","0px")}),!0)}
            ${(()=>"0px"!==this.getConfigValue("week_separator_width")&&"0"!==this.getConfigValue("week_separator_width")?Q`
                ${this.addTextField("week_separator_width",this._getTranslation("week_separator_width"))}
                ${this.addTextField("week_separator_color",this._getTranslation("week_separator_color"))}
              `:Q``)()}

            <!-- Month Separator -->
            <h5>${this._getTranslation("month_separator")}</h5>
            ${this.addBooleanField("month_separator_toggle",this._getTranslation("show_month_separator"),"0px"!==this.getConfigValue("month_separator_width")&&"0"!==this.getConfigValue("month_separator_width"),(e=>{e.target.checked?this.setConfigValue("month_separator_width","1px"):this.setConfigValue("month_separator_width","0px")}),!0)}
            ${(()=>"0px"!==this.getConfigValue("month_separator_width")&&"0"!==this.getConfigValue("month_separator_width")?Q`
                ${this.addTextField("month_separator_width",this._getTranslation("month_separator_width"))}
                ${this.addTextField("month_separator_color",this._getTranslation("month_separator_color"))}
              `:Q``)()}
          `)}

        <!-- EVENT DISPLAY -->
        ${this.addExpansionPanel(this._getTranslation("event_display"),"M20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20M5,13V15H16V13H5M5,9V11H19V9H5Z",Q`
            <!-- Event Content -->
            <h3>${this._getTranslation("event_title")}</h3>
            ${this.addTextField("event_font_size",this._getTranslation("event_font_size"))}
            ${this.addTextField("event_color",this._getTranslation("event_color"))}
            ${this.addTextField("empty_day_color",this._getTranslation("empty_day_color"))}

            <!-- Time Display -->
            <h3>${this._getTranslation("time")}</h3>
            ${this.addBooleanField("show_time",this._getTranslation("show_time"))}
            ${(()=>!0!==this.getConfigValue("show_time")?Q``:Q`
                ${this.addBooleanField("show_single_allday_time",this._getTranslation("show_single_allday_time"))}
                ${this.addBooleanField("show_end_time",this._getTranslation("show_end_time"))}
                ${this.addTextField("time_font_size",this._getTranslation("time_font_size"))}
                ${this.addTextField("time_color",this._getTranslation("time_color"))}
                ${this.addTextField("time_icon_size",this._getTranslation("time_icon_size"))}
              `)()}

            <!-- Location Display -->
            <h3>${this._getTranslation("location")}</h3>
            ${this.addBooleanField("show_location",this._getTranslation("show_location"))}
            ${(()=>!0!==this.getConfigValue("show_location")?Q``:Q`
                ${this.addTextField("location_font_size",this._getTranslation("location_font_size"))}
                ${this.addTextField("location_color",this._getTranslation("location_color"))}
                ${this.addTextField("location_icon_size",this._getTranslation("location_icon_size"))}
                ${this.addSelectField("remove_location_country_selector",this._getTranslation("remove_location_country"),[{value:"false",label:this._getTranslation("none")},{value:"true",label:this._getTranslation("simple")},{value:"custom",label:this._getTranslation("custom")}],!1,(()=>{if(!this._config||!this._config.hasOwnProperty("remove_location_country"))return"false";const e=this._config.remove_location_country;return!0===e||"true"===e?"true":!1===e||"false"===e?"false":"string"==typeof e?"custom":"false"})(),(e=>{"true"===e?this.setConfigValue("remove_location_country",!0):"false"===e?this.setConfigValue("remove_location_country",!1):"custom"===e&&this._config&&"custom"!==this._config.remove_location_country&&"string"!=typeof this._config.remove_location_country&&this.setConfigValue("remove_location_country","USA|United States|Canada")}))}
                ${(()=>{if(!this._config||!this._config.hasOwnProperty("remove_location_country")||!0===this._config.remove_location_country||!1===this._config.remove_location_country||"true"===this._config.remove_location_country||"false"===this._config.remove_location_country)return Q``;const e=this._config.remove_location_country;return"string"==typeof e&&"true"!==e&&"false"!==e?Q`
                      <ha-textfield
                        label="${this._getTranslation("custom_country_pattern")}"
                        .value="${e}"
                        @change="${e=>this.setConfigValue("remove_location_country",e.target.value)}"
                      ></ha-textfield>
                      <div class="helper-text">
                        ${this._getTranslation("custom_country_pattern_note")}
                      </div>
                    `:Q``})()}
              `)()}

            <!-- Progress Indicators -->
            <h3>${this._getTranslation("progress_indicators")}</h3>
            ${this.addBooleanField("show_countdown",this._getTranslation("show_countdown"))}
            ${this.addBooleanField("show_progress_bar",this._getTranslation("show_progress_bar"))}
            ${(()=>!0!==this.getConfigValue("show_progress_bar")?Q``:Q`
                ${this.addTextField("progress_bar_color",this._getTranslation("progress_bar_color"))}
                ${this.addTextField("progress_bar_height",this._getTranslation("progress_bar_height"))}
                ${this.addTextField("progress_bar_width",this._getTranslation("progress_bar_width"))}
              `)()}

            <!-- Multi-day Event Handling -->
            <h3>${this._getTranslation("multiday_event_handling")}</h3>
            ${this.addBooleanField("split_multiday_events",this._getTranslation("split_multiday_events"))}
          `)}

        <!-- WEATHER INTEGRATION -->
        ${this.addExpansionPanel(this._getTranslation("weather_integration"),"M12.74,5.47C15.1,6.5 16.35,9.03 15.92,11.46C17.19,12.56 18,14.19 18,16V16.17C18.31,16.06 18.65,16 19,16A3,3 0 0,1 22,19A3,3 0 0,1 19,22H6A4,4 0 0,1 2,18A4,4 0 0,1 6,14H6.27C5,12.45 4.6,10.24 5.5,8.26C6.72,5.5 9.97,4.24 12.74,5.47M11.93,7.3C10.16,6.5 8.09,7.31 7.31,9.07C6.85,10.09 6.93,11.22 7.41,12.13C8.5,10.83 10.16,10 12,10C12.7,10 13.38,10.12 14,10.34C13.94,9.06 13.18,7.86 11.93,7.3M13.55,3.64C13,3.4 12.45,3.23 11.88,3.12L14.37,1.82L15.27,4.71C14.76,4.29 14.19,3.93 13.55,3.64M6.09,4.44C5.6,4.79 5.17,5.19 4.8,5.63L4.91,2.82L7.87,3.5C7.25,3.71 6.65,4.03 6.09,4.44M18,9.71C17.91,9.12 17.78,8.55 17.59,8L19.97,9.5L17.92,11.73C18.03,11.08 18.05,10.4 18,9.71M3.04,11.3C3.11,11.9 3.24,12.47 3.43,13L1.06,11.5L3.1,9.28C3,9.93 2.97,10.61 3.04,11.3M19,18H16V16A4,4 0 0,0 12,12A4,4 0 0,0 8,16H6A2,2 0 0,0 4,18A2,2 0 0,0 6,20H19A1,1 0 0,0 20,19A1,1 0 0,0 19,18Z",Q`
            <!-- Weather Entity & Position -->
            <h3>${this._getTranslation("weather_entity_position")}</h3>
            ${this.addEntityPickerField("weather.entity",this._getTranslation("weather_entity"),["weather"])}

            <!-- Only show the rest of the weather config when an entity is selected -->
            ${(()=>this.getConfigValue("weather.entity")?Q`
                ${this.addSelectField("weather.position",this._getTranslation("weather_position"),[{value:"none",label:this._getTranslation("none")},{value:"date",label:this._getTranslation("date")},{value:"event",label:this._getTranslation("event")},{value:"both",label:this._getTranslation("both")}])}

                <!-- Conditionally render weather settings based on selected position -->
                ${(()=>{const e=this.getConfigValue("weather.position","none");return Q`
                    ${"date"===e||"both"===e?Q`
                          <!-- Date Column Weather -->
                          <h3>${this._getTranslation("date_column_weather")}</h3>
                          ${this.addBooleanField("weather.date.show_conditions",this._getTranslation("show_conditions"))}
                          ${this.addBooleanField("weather.date.show_high_temp",this._getTranslation("show_high_temp"))}
                          ${this.addBooleanField("weather.date.show_low_temp",this._getTranslation("show_low_temp"))}
                          ${this.addTextField("weather.date.icon_size",this._getTranslation("icon_size"))}
                          ${this.addTextField("weather.date.font_size",this._getTranslation("font_size"))}
                          ${this.addTextField("weather.date.color",this._getTranslation("color"))}
                        `:Q``}
                    ${"event"===e||"both"===e?Q`
                          <!-- Event Row Weather -->
                          <h3>${this._getTranslation("event_row_weather")}</h3>
                          ${this.addBooleanField("weather.event.show_conditions",this._getTranslation("show_conditions"))}
                          ${this.addBooleanField("weather.event.show_temp",this._getTranslation("show_temp"))}
                          ${this.addTextField("weather.event.icon_size",this._getTranslation("icon_size"))}
                          ${this.addTextField("weather.event.font_size",this._getTranslation("font_size"))}
                          ${this.addTextField("weather.event.color",this._getTranslation("color"))}
                        `:Q``}
                  `})()}
              `:Q``)()}
          `)}

        <!-- INTERACTIONS -->
        ${this.addExpansionPanel(this._getTranslation("interactions"),"M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M9,12.44V9A2,2 0 0,1 11,7A2,2 0 0,1 13,9V12.44C14.19,11.75 15,10.47 15,9A4,4 0 0,0 11,5A4,4 0 0,0 7,9C7,10.47 7.81,11.75 9,12.44Z",Q`
            <!-- Tap Action -->
            <h3>${this._getTranslation("tap_action")}</h3>
            ${this._renderActionConfig("tap_action")}

            <!-- Hold Action -->
            <h3>${this._getTranslation("hold_action")}</h3>
            ${this._renderActionConfig("hold_action")}

            <!-- Refresh Settings -->
            <h3>${this._getTranslation("refresh_settings")}</h3>
            ${this.addTextField("refresh_interval",this._getTranslation("refresh_interval"),"number")}
            ${this.addBooleanField("refresh_on_navigate",this._getTranslation("refresh_on_navigate"))}
          `)}
      </div>
    `}addTextField(e,t,a,n){let i=this.getConfigValue(e,n);return void 0===i&&(i=""),Q`
      <ha-textfield
        name="${e}"
        label="${null!=t?t:this._getTranslation(e)}"
        type="${null!=a?a:"text"}"
        .value="${i}"
        @keyup="${this._valueChanged}"
        @change="${this._valueChanged}"
      ></ha-textfield>
    `}addEntityPickerField(e,t,a,n){return Q`
      <ha-entity-picker
        .hass="${this.hass}"
        name="${e}"
        label="${null!=t?t:this._getTranslation(e)}"
        .value="${this.getConfigValue(e,n)}"
        .includeDomains="${a}"
        @value-changed="${t=>{t.stopPropagation(),this.setConfigValue(e,t.detail.value)}}"
      ></ha-entity-picker>
    `}addBooleanField(e,t,a,n,i=!1){return Q`
      <ha-formfield label="${null!=t?t:this._getTranslation(e)}">
        <ha-switch
          name="${e}"
          .checked="${this.getConfigValue(e,a)}"
          @change="${e=>{i||this._valueChanged(e),n&&n(e)}}"
        ></ha-switch>
      </ha-formfield>
    `}addSelectField(e,t,a,n,i,r){return Q`
      <ha-select
        name="${e}"
        label="${null!=t?t:this._getTranslation(e)}"
        .value="${this.getConfigValue(e,i)}"
        .clearable="${null!=n&&n}"
        @change="${e=>{if(this._valueChanged(e),r&&e.target){const t=e.target.value;r(t)}}}"
        @closed="${e=>e.stopPropagation()}"
      >
        ${null==a?void 0:a.map((e=>Q`
            <mwc-list-item value="${e.value}">${e.label}</mwc-list-item>
          `))}
      </ha-select>
    `}addDateField(e,t,a){var n;let i=this.getConfigValue(e,a);void 0===i&&(i="");const r=!i||"string"!=typeof i&&"number"!=typeof i?"":function(e,t,a="YYYY-MM-DD"){if(!e||isNaN(e.getTime()))return"";if(!t||"YYYY-MM-DD"===t.date_format)return Yt(e);try{if(!t.date_format||"system"===t.date_format){const a=t.language||navigator.language;return new Intl.DateTimeFormat(a,{year:"numeric",month:"2-digit",day:"2-digit"}).format(e)}if("language"===t.date_format&&t.language)return new Intl.DateTimeFormat(t.language,{year:"numeric",month:"2-digit",day:"2-digit"}).format(e);if("DD/MM/YYYY"===t.date_format){const t=String(e.getDate()).padStart(2,"0");return`${t}/${String(e.getMonth()+1).padStart(2,"0")}/${e.getFullYear()}`}if("MM/DD/YYYY"===t.date_format){const t=String(e.getDate()).padStart(2,"0");return`${String(e.getMonth()+1).padStart(2,"0")}/${t}/${e.getFullYear()}`}}catch(e){console.warn("Error formatting date:",e)}return"YYYY-MM-DD"===a?Yt(e):(new Intl.DateTimeFormat).format(e)}(new Date(i),null==(n=this.hass)?void 0:n.locale);return Q`
      <div class="date-input">
        <div class="mdc-text-field mdc-text-field--filled">
          <!-- Ripple overlay element for hover effect -->
          <div class="mdc-text-field__ripple"></div>

          <span class="mdc-floating-label mdc-floating-label--float-above">
            ${null!=t?t:this._getTranslation(e)}
          </span>

          <div class="value-container">
            <span class="value-text">${r}</span>
          </div>
        </div>

        <input
          type="date"
          name="${e}"
          .value="${i}"
          @focus="${e=>{const t=e.target.closest(".date-input"),a=null==t?void 0:t.querySelector(".mdc-text-field"),n=null==t?void 0:t.querySelector(".mdc-floating-label"),i=null==t?void 0:t.querySelector(".mdc-text-field__ripple");a&&(a.classList.add("focused"),a.style.borderBottom="2px solid var(--primary-color)",n&&(n.style.color="var(--primary-color)")),i&&(i.style.opacity="0.08")}}"
          @blur="${e=>{const t=e.target.closest(".date-input"),a=null==t?void 0:t.querySelector(".mdc-text-field"),n=null==t?void 0:t.querySelector(".mdc-floating-label"),i=null==t?void 0:t.querySelector(".mdc-text-field__ripple");a&&(a.classList.remove("focused"),a.style.borderBottom="1px solid var(--mdc-text-field-idle-line-color, var(--secondary-text-color))",n&&(n.style.color="var(--mdc-select-label-ink-color, rgba(0,0,0,.6))")),i&&(i.style.opacity="0")}}"
          @mouseover="${e=>{const t=e.target.closest(".date-input"),a=null==t?void 0:t.querySelector(".mdc-text-field"),n=null==t?void 0:t.querySelector(".mdc-text-field__ripple");a&&!a.classList.contains("focused")&&(a.style.borderBottomColor="var(--primary-text-color)",n&&(n.style.opacity="0.04"))}}"
          @mouseout="${e=>{const t=e.target.closest(".date-input"),a=null==t?void 0:t.querySelector(".mdc-text-field"),n=null==t?void 0:t.querySelector(".mdc-text-field__ripple");a&&!a.classList.contains("focused")&&(a.style.borderBottomColor="var(--mdc-text-field-idle-line-color, var(--secondary-text-color))",n&&(n.style.opacity="0"))}}"
          @change="${e=>{this._valueChanged(e);const t=e.target,a=t.closest(".date-input"),n=null==a?void 0:a.querySelector(".value-container span");n&&t.value&&(n.textContent=new Date(t.value).toLocaleDateString())}}"
        />
      </div>
    `}addExpansionPanel(e,t,a,n){return Q`
      <ha-expansion-panel .header="${e}" .expanded="${null!=n&&n}" outlined>
        <ha-svg-icon slot="leading-icon" .path=${t}></ha-svg-icon>
        <div class="panel-content">${a}</div>
      </ha-expansion-panel>
    `}addButton(e,t,a){return Q`
      <ha-button @click="${a}">
        <ha-icon icon="${t}"></ha-icon>
        ${e}
      </ha-button>
    `}addIconPickerField(e,t){return Q`
      <ha-icon-picker
        .hass="${this.hass}"
        name="${e}"
        label="${null!=t?t:this._getTranslation(e)}"
        .value="${this.getConfigValue(e)}"
        @value-changed="${t=>{this.setConfigValue(e,t.detail.value)}}"
      ></ha-icon-picker>
    `}addTodayIndicatorField(e,t){const a=[{value:"none",label:this._getTranslation("none")},{value:"dot",label:this._getTranslation("dot")},{value:"pulse",label:this._getTranslation("pulse")},{value:"glow",label:this._getTranslation("glow")},{value:"icon",label:this._getTranslation("icon")},{value:"emoji",label:this._getTranslation("emoji")},{value:"image",label:this._getTranslation("image")}];return this._renderTypeSelector(e,null!=t?t:this._getTranslation(e),a,"indicator")}_renderCalendarEntity(e,t){const a="string"==typeof e,n=a?e:e.entity,i=a||!e.label?`${this._getTranslation("calendar")}: ${n}`:`${this._getTranslation("calendar")}: ${e.label} (${n})`;return Q`
      ${this.addExpansionPanel(i,"M19,19H5V8H19M16,1V3H8V1H6V3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3H18V1M17,12H12V17H17V12Z",Q`
          <!-- Entity Identification Section -->
          <div class="editor-section">
            <h4>${this._getTranslation("entity_identification")}</h4>
            ${this.addEntityPickerField(`entities.${t}${a?"":".entity"}`,this._getTranslation("entity"),["calendar"])}
          </div>

          ${a?Q``:Q`
                <!-- Display Settings Section -->
                <div class="editor-section">
                  <h4>${this._getTranslation("display_settings")}</h4>

                  <div class="subsection">
                    <h5>${this._getTranslation("label")}</h5>
                    ${(()=>{const e=`entities.${t}.label`,a=[{value:"none",label:this._getTranslation("none")},{value:"text",label:this._getTranslation("text_emoji")},{value:"icon",label:this._getTranslation("icon")},{value:"image",label:this._getTranslation("image")}];return this._renderTypeSelector(e,this._getTranslation("label_type"),a,"label")})()}
                    <div class="helper-text">${this._getTranslation("label_note")}</div>
                  </div>

                  <div class="subsection">
                    <h5>${this._getTranslation("colors")}</h5>
                    ${this.addTextField(`entities.${t}.color`,this._getTranslation("event_color"))}
                    <div class="helper-text">${this._getTranslation("entity_color_note")}</div>

                    ${this.addTextField(`entities.${t}.accent_color`,this._getTranslation("accent_color"))}
                    <div class="helper-text">
                      ${this._getTranslation("entity_accent_color_note")}
                    </div>
                  </div>
                </div>

                <!-- Event Filtering Section -->
                <div class="editor-section">
                  <h4>${this._getTranslation("event_filtering")}</h4>

                  ${this.addTextField(`entities.${t}.blocklist`,this._getTranslation("blocklist"))}
                  <div class="helper-text">${this._getTranslation("blocklist_note")}</div>

                  ${this.addTextField(`entities.${t}.allowlist`,this._getTranslation("allowlist"))}
                  <div class="helper-text">${this._getTranslation("allowlist_note")}</div>
                </div>

                <!-- Entity Overrides Section -->
                <div class="editor-section">
                  <h4>${this._getTranslation("entity_overrides")}</h4>
                  <div class="helper-text section-note">
                    ${this._getTranslation("entity_overrides_note")}
                  </div>

                  ${this.addTextField(`entities.${t}.compact_events_to_show`,this._getTranslation("compact_events_to_show"),"number")}
                  <div class="helper-text">
                    ${this._getTranslation("entity_compact_events_note")}
                  </div>

                  ${this.addBooleanField(`entities.${t}.show_time`,this._getTranslation("show_time"))}
                  <div class="helper-text">${this._getTranslation("entity_show_time_note")}</div>

                  ${this.addBooleanField(`entities.${t}.show_location`,this._getTranslation("show_location"))}
                  <div class="helper-text">
                    ${this._getTranslation("entity_show_location_note")}
                  </div>

                  ${this.addBooleanField(`entities.${t}.split_multiday_events`,this._getTranslation("split_multiday_events"))}
                  <div class="helper-text">
                    ${this._getTranslation("entity_split_multiday_note")}
                  </div>
                </div>
              `}

          <!-- Entity Action Buttons -->
          <div class="editor-section button-section">
            ${this.addButton(this._getTranslation("remove"),"mdi:trash-can",(()=>this._removeCalendarEntity(t)))}
            ${a?Q`
                  ${this.addButton(this._getTranslation("convert_to_advanced"),"mdi:code-json",(()=>this._convertEntityToObject(t)))}
                `:Q``}
          </div>
        `)}
    `}_renderCalendarEntities(){var e;const t=(null==(e=this._config)?void 0:e.entities)||[];return Q`
      ${t.map(((e,t)=>this._renderCalendarEntity(e,t)))}
      ${this.addButton(this._getTranslation("add_calendar"),"mdi:plus",(()=>this._addCalendarEntity()))}
    `}_addCalendarEntity(){var e;const t=[...(null==(e=this._config)?void 0:e.entities)||[]];t.push({entity:"calendar.calendar"}),this.setConfigValue("entities",t)}_removeCalendarEntity(e){var t;const a=[...(null==(t=this._config)?void 0:t.entities)||[]];a.splice(e,1),this.setConfigValue("entities",a)}_convertEntityToObject(e){var t;const a=[...(null==(t=this._config)?void 0:t.entities)||[]],n=a[e];a[e]={entity:n},this.setConfigValue("entities",a)}_renderActionConfig(e){const t=this.getConfigValue(e,{action:"none"}),a=t.action||"none";return Q`
      <div class="action-config">
        <ha-select
          name="${e}.action"
          .value="${a}"
          @change="${this._valueChanged}"
          @closed="${e=>e.stopPropagation()}"
        >
          <mwc-list-item value="none">${this._getTranslation("none")}</mwc-list-item>
          <mwc-list-item value="expand">${this._getTranslation("expand")}</mwc-list-item>
          <mwc-list-item value="more-info">${this._getTranslation("more_info")}</mwc-list-item>
          <mwc-list-item value="navigate">${this._getTranslation("navigate")}</mwc-list-item>
          <mwc-list-item value="url">${this._getTranslation("url")}</mwc-list-item>
          <mwc-list-item value="call-service"
            >${this._getTranslation("call_service")}</mwc-list-item
          >
        </ha-select>

        ${"navigate"===a?Q`
              <ha-textfield
                name="${e}.navigation_path"
                .value="${t.navigation_path||""}"
                label="${this._getTranslation("navigation_path")}"
                @change="${this._valueChanged}"
              ></ha-textfield>
            `:Q``}
        ${"url"===a?Q`
              <ha-textfield
                name="${e}.url_path"
                .value="${t.url_path||""}"
                label="${this._getTranslation("url_path")}"
                @change="${this._valueChanged}"
              ></ha-textfield>
            `:Q``}
        ${"call-service"===a?Q`
              <ha-textfield
                name="${e}.service"
                .value="${t.service||""}"
                label="${this._getTranslation("service")}"
                @change="${this._valueChanged}"
              ></ha-textfield>
              <ha-textfield
                name="${e}.service_data"
                .value="${t.service_data?JSON.stringify(t.service_data):"{}"}"
                label="${this._getTranslation("service_data")}"
                @change="${this._serviceDataChanged}"
              ></ha-textfield>
            `:Q``}
      </div>
    `}getValueType(e,t="label"){return e&&!1!==e?!0===e?"indicator"===t?"dot":"none":"string"==typeof e?e.startsWith("mdi:")?"icon":e.startsWith("/")||/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(e)?"image":"indicator"===t?["dot","pulse","glow"].includes(e)?e:"emoji":"text":"none":"none"}_handleValueTypeChange(e,t,a,n="label"){e.stopPropagation();const i=e.target.value;let r;"none"===i?r="indicator"!==n&&void 0:"icon"===i?r="string"==typeof a&&a.startsWith("mdi:")?a:"indicator"===n?"mdi:star":"mdi:calendar":"image"===i?r="string"==typeof a&&(a.startsWith("/")||/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(a))?a:"indicator"===n?"/local/image.jpg":"/local/calendar.jpg":"indicator"===n?["dot","pulse","glow"].includes(i)?r=i:"emoji"===i&&(r="string"!=typeof a||a.startsWith("mdi:")||/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(a)||/^\/local\//i.test(a)||["dot","pulse","glow"].includes(a)?"🗓️":a):"text"===i&&(r="string"==typeof a&&"text"===this.getValueType(a,"label")?a:"📅"),this.setConfigValue(t,r)}_renderTypeSelector(e,t,a,n="label"){const i=this.getConfigValue(e),r=this.getValueType(i,n);return Q`
      <div class="type-selector-field">
        <ha-select
          name="${e}_type"
          label="${t}"
          .value="${r}"
          @change="${t=>this._handleValueTypeChange(t,e,i,n)}"
          @closed="${e=>e.stopPropagation()}"
        >
          ${a.map((e=>Q` <mwc-list-item value="${e.value}">${e.label}</mwc-list-item> `))}
        </ha-select>

        ${this._renderTypeField(r,e,i,n)}
      </div>
    `}_renderTypeField(e,t,a,n){if("icon"===e)return Q`
        <div class="icon-picker-wrapper">
          <ha-icon-picker
            .hass="${this.hass}"
            .value="${a}"
            @value-changed="${e=>{const a=e.detail.value;if(a){const e=a.startsWith("mdi:")?a:`mdi:${a}`;this.setConfigValue(t,e)}else this.setConfigValue(t,"indicator"===n?"dot":"")}}"
          ></ha-icon-picker>
        </div>
      `;if("emoji"===e||"text"===e){const n="emoji"===e?this._getTranslation("emoji_value"):this._getTranslation("text_value"),i="emoji"===e?this._getTranslation("emoji_indicator_note"):this._getTranslation("text_label_note");return Q`
        <ha-textfield
          name="${t}"
          label="${n}"
          .value="${a}"
          @change="${this._valueChanged}"
        ></ha-textfield>
        <div class="helper-text">${i}</div>
      `}return"image"===e?Q`
        <ha-textfield
          name="${t}"
          label="${this._getTranslation("image_path")}"
          .value="${a}"
          @change="${this._valueChanged}"
        ></ha-textfield>
        <div class="helper-text">${this._getTranslation("image_indicator_note")}</div>
      `:Q``}}hi([$e({attribute:!1})],gi.prototype,"hass"),hi([$e({attribute:!1})],gi.prototype,"_config");var pi=Object.defineProperty,fi=Object.defineProperties,yi=Object.getOwnPropertyDescriptor,vi=Object.getOwnPropertyDescriptors,wi=Object.getOwnPropertySymbols,ki=Object.prototype.hasOwnProperty,bi=Object.prototype.propertyIsEnumerable,Mi=(e,t,a)=>t in e?pi(e,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):e[t]=a,Ti=(e,t)=>{for(var a in t||(t={}))ki.call(t,a)&&Mi(e,a,t[a]);if(wi)for(var a of wi(t))bi.call(t,a)&&Mi(e,a,t[a]);return e},$i=(e,t,a,n)=>{for(var i,r=n>1?void 0:n?yi(t,a):t,o=e.length-1;o>=0;o--)(i=e[o])&&(r=(n?i(t,a,r):i(r))||r);return n&&r&&pi(t,a,r),r};let Di=class extends ve{constructor(){super(),this.config=Ti({},rt),this.events=[],this.isLoading=!0,this.isExpanded=!1,this.weatherForecasts={daily:{},hourly:{}},this._instanceId=Dt(),this._language="",this._lastUpdateTime=Date.now(),this._weatherUnsubscribers=[],this._activePointerId=null,this._holdTriggered=!1,this._holdTimer=null,this._holdIndicator=null,this._handleVisibilityChange=()=>{if("visible"===document.visibilityState){Date.now()-this._lastUpdateTime>He&&(at("Visibility changed to visible, updating events"),this.updateEvents())}},this._instanceId=Dt(),Qe(De)}static getConfigElement(){return document.createElement("calendar-card-pro-editor")}get safeHass(){return this.hass||null}get effectiveLanguage(){return!this._language&&this.hass&&(this._language=Mt(this.config.language,this.hass.locale)),this._language||"en"}get groupedEvents(){return hn(this.events,this.config,this.isExpanded,this.effectiveLanguage)}static get styles(){return xn}connectedCallback(){super.connectedCallback(),at("Component connected"),this.startRefreshTimer(),this.updateEvents(),this._setupWeatherSubscriptions(),document.addEventListener("visibilitychange",this._handleVisibilityChange)}disconnectedCallback(){super.disconnectedCallback(),this._cleanupWeatherSubscriptions(),this._refreshTimerId&&clearTimeout(this._refreshTimerId),this._holdTimer&&(clearTimeout(this._holdTimer),this._holdTimer=null),this._holdIndicator&&(Yn(this._holdIndicator),this._holdIndicator=null),document.removeEventListener("visibilitychange",this._handleVisibilityChange),at("Component disconnected")}updated(e){var t,a,n,i,r,o,s;(e.has("hass")&&(null==(t=this.hass)?void 0:t.locale)||e.has("config")&&(null==(a=e.get("config"))?void 0:a.language)!==this.config.language)&&(this._language=Mt(this.config.language,null==(n=this.hass)?void 0:n.locale)),e.has("config")&&(null==(r=null==(i=this.config)?void 0:i.weather)?void 0:r.entity)!==(null==(s=null==(o=e.get("config"))?void 0:o.weather)?void 0:s.entity)&&this._setupWeatherSubscriptions()}getCustomStyles(){return function(e){var t,a,n,i,r,o,s,l,d,_,c,h;const u={"--calendar-card-background-color":e.background_color,"--calendar-card-font-size-weekday":e.weekday_font_size,"--calendar-card-font-size-day":e.day_font_size,"--calendar-card-font-size-month":e.month_font_size,"--calendar-card-font-size-event":e.event_font_size,"--calendar-card-font-size-time":e.time_font_size,"--calendar-card-font-size-location":e.location_font_size,"--calendar-card-color-weekday":e.weekday_color,"--calendar-card-color-day":e.day_color,"--calendar-card-color-month":e.month_color,"--calendar-card-color-event":e.event_color,"--calendar-card-color-time":e.time_color,"--calendar-card-color-location":e.location_color,"--calendar-card-line-color-vertical":e.accent_color,"--calendar-card-line-width-vertical":e.vertical_line_width,"--calendar-card-day-spacing":e.day_spacing,"--calendar-card-event-spacing":e.event_spacing,"--calendar-card-spacing-additional":e.additional_card_spacing,"--calendar-card-height":e.height||"auto","--calendar-card-max-height":e.max_height,"--calendar-card-progress-bar-color":e.progress_bar_color,"--calendar-card-progress-bar-height":e.progress_bar_height,"--calendar-card-progress-bar-width":e.progress_bar_width,"--calendar-card-icon-size-time":e.time_icon_size||"14px","--calendar-card-icon-size-location":e.location_icon_size||"14px","--calendar-card-date-column-width":1.75*parseFloat(e.day_font_size)+"px","--calendar-card-date-column-vertical-alignment":e.date_vertical_alignment,"--calendar-card-event-border-radius":"calc(var(--ha-card-border-radius, 10px) / 2)","--ha-ripple-hover-opacity":"0.04","--ha-ripple-hover-color":e.accent_color,"--ha-ripple-pressed-opacity":"0.12","--ha-ripple-pressed-color":e.accent_color,"--calendar-card-today-indicator-color":e.today_indicator_color,"--calendar-card-today-indicator-size":e.today_indicator_size,"--calendar-card-week-number-font-size":e.week_number_font_size,"--calendar-card-week-number-color":e.week_number_color,"--calendar-card-week-number-bg-color":e.week_number_background_color,"--calendar-card-empty-day-color":e.empty_day_color===rt.empty_day_color?"color-mix(in srgb, var(--primary-text-color) 60%, transparent)":e.empty_day_color,"--calendar-card-weather-date-icon-size":(null==(a=null==(t=e.weather)?void 0:t.date)?void 0:a.icon_size)||"14px","--calendar-card-weather-date-font-size":(null==(i=null==(n=e.weather)?void 0:n.date)?void 0:i.font_size)||"12px","--calendar-card-weather-date-color":(null==(o=null==(r=e.weather)?void 0:r.date)?void 0:o.color)||"var(--primary-text-color)","--calendar-card-weather-event-icon-size":(null==(l=null==(s=e.weather)?void 0:s.event)?void 0:l.icon_size)||"14px","--calendar-card-weather-event-font-size":(null==(_=null==(d=e.weather)?void 0:d.event)?void 0:_.font_size)||"12px","--calendar-card-weather-event-color":(null==(h=null==(c=e.weather)?void 0:c.event)?void 0:h.color)||"var(--primary-text-color)"};return e.title_font_size&&(u["--calendar-card-font-size-title"]=e.title_font_size),e.title_color&&(u["--calendar-card-color-title"]=e.title_color),u}(this.config)}startRefreshTimer(){this._refreshTimerId&&clearTimeout(this._refreshTimerId);const e=this.config.refresh_interval||Se,t=60*e*1e3;this._refreshTimerId=window.setTimeout((()=>{this.updateEvents(),this.startRefreshTimer()}),t),at(`Scheduled next refresh in ${e} minutes`)}_setupWeatherSubscriptions(){var e,t;if(this._cleanupWeatherSubscriptions(),!(null==(t=null==(e=this.config)?void 0:e.weather)?void 0:t.entity)||!this.hass)return;(function(e){if(!e||!e.entity)return[];return"date"===(e.position||"date")?["daily"]:["daily","hourly"]})(this.config.weather).forEach((e=>{const t=function(e,t,a,n){var i;if(!(null==e?void 0:e.connection)||!(null==(i=null==t?void 0:t.weather)?void 0:i.entity))return;const r=t.weather.entity;try{return e.connection.subscribeMessage((e=>{if(e&&Array.isArray(e.forecast)){const t=Kn(e.forecast,a);n(t)}}),{type:"weather/subscribe_forecast",forecast_type:a,entity_id:r})}catch(e){return void Xe("Failed to subscribe to weather forecast",{entity:r,forecast_type:a,error:e})}}(this.hass,this.config,e,(t=>{var a;this.weatherForecasts=(a=Ti({},this.weatherForecasts),fi(a,vi({[e]:t}))),this.requestUpdate()}));t&&this._weatherUnsubscribers.push(t)}))}_cleanupWeatherSubscriptions(){this._weatherUnsubscribers.forEach((e=>{"function"==typeof e&&e()})),this._weatherUnsubscribers=[]}_handlePointerDown(e){var t;this._activePointerId=e.pointerId,this._holdTriggered=!1,"none"!==(null==(t=this.config.hold_action)?void 0:t.action)&&(this._holdTimer&&clearTimeout(this._holdTimer),this._holdTimer=window.setTimeout((()=>{this._activePointerId===e.pointerId&&(this._holdTriggered=!0,this._holdIndicator=function(e,t){const a=document.createElement("div");a.style.position="absolute",a.style.pointerEvents="none",a.style.borderRadius="50%",a.style.backgroundColor=t.accent_color,a.style.opacity=`${Ve}`,a.style.transform="translate(-50%, -50%) scale(0)",a.style.transition=`transform ${Ee}ms ease-out`,a.style.left=e.pageX+"px",a.style.top=e.pageY+"px";const n="touch"===e.pointerType?Oe.TOUCH_SIZE:Oe.POINTER_SIZE;return a.style.width=`${n}px`,a.style.height=`${n}px`,document.body.appendChild(a),setTimeout((()=>{a.style.transform="translate(-50%, -50%) scale(1)"}),10),at("Created hold indicator"),a}(e,this.config))}),je))}_handlePointerUp(e){if(e.pointerId===this._activePointerId){if(this._holdTimer&&(clearTimeout(this._holdTimer),this._holdTimer=null),this._holdTriggered&&this.config.hold_action){at("Executing hold action");const e=Dn(this.config.entities);Sn(this.config.hold_action,this.safeHass,this,e,(()=>this.toggleExpanded()))}else if(!this._holdTriggered&&this.config.tap_action){at("Executing tap action");const e=Dn(this.config.entities);Sn(this.config.tap_action,this.safeHass,this,e,(()=>this.toggleExpanded()))}this._activePointerId=null,this._holdTriggered=!1,this._holdIndicator&&(Yn(this._holdIndicator),this._holdIndicator=null)}}_handlePointerCancel(){this._holdTimer&&(clearTimeout(this._holdTimer),this._holdTimer=null),this._activePointerId=null,this._holdTriggered=!1,this._holdIndicator&&(Yn(this._holdIndicator),this._holdIndicator=null)}_handleKeyDown(e){if("Enter"===e.key||" "===e.key){e.preventDefault();const t=Dn(this.config.entities);Sn(this.config.tap_action,this.safeHass,this,t,(()=>this.toggleExpanded()))}}setConfig(e){var t,a,n,i,r,o;const s=this.config;let l=Ti(Ti({},rt),e);var d;this.config=l,this.config.entities=(d=this.config.entities,Array.isArray(d)?d.map((e=>"string"==typeof e?{entity:e,color:"var(--primary-text-color)",accent_color:void 0}:"object"==typeof e&&e.entity?{entity:e.entity,label:e.label,color:e.color||"var(--primary-text-color)",accent_color:e.accent_color||void 0,show_time:e.show_time,show_location:e.show_location,compact_events_to_show:e.compact_events_to_show,blocklist:e.blocklist,allowlist:e.allowlist,split_multiday_events:e.split_multiday_events}:null)).filter(Boolean):[]),this._instanceId=St(this.config.entities,this.config.days_to_show,this.config.show_past_events,this.config.start_date);((null==(a=null==(t=this.config)?void 0:t.weather)?void 0:a.entity)!==(null==(n=e.weather)?void 0:n.entity)||(null==(r=null==(i=this.config)?void 0:i.weather)?void 0:r.position)!==(null==(o=e.weather)?void 0:o.position))&&this._setupWeatherSubscriptions();(function(e,t){if(!e||0===Object.keys(e).length)return!0;const a=(e.entities||[]).map((e=>"string"==typeof e?e:e.entity)).sort().join(","),n=(t.entities||[]).map((e=>"string"==typeof e?e:e.entity)).sort().join(","),i=(null==e?void 0:e.refresh_interval)!==(null==t?void 0:t.refresh_interval),r=a!==n||e.days_to_show!==t.days_to_show||e.start_date!==t.start_date||e.show_past_events!==t.show_past_events||e.filter_duplicates!==t.filter_duplicates;return(r||i)&&at("Configuration change requires data refresh"),r||i})(s,this.config)&&(at("Configuration changed, refreshing data"),this.updateEvents(!0)),this.startRefreshTimer()}async updateEvents(e=!1){if(at(`Updating events (force=${e})`),this.safeHass&&this.config.entities.length){try{this.isLoading=!0,await this.updateComplete;const t=await cn(this.safeHass,this.config,this._instanceId,e);this.isLoading=!1,await this.updateComplete,this.events=[...t],this._lastUpdateTime=Date.now(),tt("Event update completed successfully")}catch(e){Xe("Failed to update events:",e),this.isLoading=!1}this._setupWeatherSubscriptions()}else this.isLoading=!1}toggleExpanded(){(this.config.compact_events_to_show||this.config.compact_days_to_show)&&(this.isExpanded=!this.isExpanded)}handleAction(e){const t=Dn(this.config.entities);Sn(e,this.safeHass,this,t,(()=>this.toggleExpanded()))}render(){const e=this.getCustomStyles(),t={keyDown:e=>this._handleKeyDown(e),pointerDown:e=>this._handlePointerDown(e),pointerUp:e=>this._handlePointerUp(e),pointerCancel:()=>this._handlePointerCancel(),pointerLeave:()=>this._handlePointerCancel()};let a;if(this.isLoading)a=qn("loading",this.effectiveLanguage);else if(this.safeHass&&this.config.entities.length)if(0===this.events.length){a=ii(hn([],this.config,this.isExpanded,this.effectiveLanguage),this.config,this.effectiveLanguage,this.weatherForecasts,this.safeHass)}else a=ii(this.groupedEvents,this.config,this.effectiveLanguage,this.weatherForecasts,this.safeHass);else a=qn("error",this.effectiveLanguage);return function(e,t,a,n,i=!1){return Q`
    <ha-card
      class="calendar-card-pro ${i?"max-height-set":""}"
      style=${Vn(e)}
      tabindex="0"
      @keydown=${n.keyDown}
      @pointerdown=${n.pointerDown}
      @pointerup=${n.pointerUp}
      @pointercancel=${n.pointerCancel}
      @pointerleave=${n.pointerLeave}
    >
      <ha-ripple></ha-ripple>

      <!-- Title is always rendered with the same structure, even if empty -->
      <div class="header-container">
        ${t?Q`<h1 class="card-header">${t}</h1>`:Q`<div class="card-header-placeholder"></div>`}
      </div>

      <!-- Content container is always present -->
      <div class="content-container">${a}</div>
    </ha-card>
  `}(e,this.config.title,a,t)}};var Si;Di.getStubConfig=ot,$i([$e({attribute:!1})],Di.prototype,"hass",2),$i([$e({attribute:!1})],Di.prototype,"config",2),$i([$e({attribute:!1})],Di.prototype,"events",2),$i([$e({attribute:!1})],Di.prototype,"isLoading",2),$i([$e({attribute:!1})],Di.prototype,"isExpanded",2),$i([$e({attribute:!1})],Di.prototype,"weatherForecasts",2),Di=$i([(Si="calendar-card-pro",(e,t)=>{void 0!==t?t.addInitializer((()=>{customElements.define(Si,e)})):customElements.define(Si,e)})],Di),customElements.define("calendar-card-pro-editor",gi);const xi=customElements.get("calendar-card-pro");xi&&(xi.getStubConfig=ot),window.customCards=window.customCards||[],window.customCards.push({type:"calendar-card-pro",name:"Calendar Card Pro",preview:!0,description:"A calendar card that supports multiple calendars with individual styling.",documentationURL:"https://github.com/alexpfau/calendar-card-pro"});
//# sourceMappingURL=calendar-card-pro.js.map
