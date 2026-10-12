// Shared production brief: server-owned selection and renderer use the same copy zone.
// These are explainable category rules, not an AI quality score or physical reconstruction.
export type CopyZone='top'|'bottom'|'left';
export type ArtDirection={id:string;copyZone:CopyZone;techniques:string[];concepts:string[];constraints:string[]};
const directions:Record<string,ArtDirection>={
 packaging:{id:'packaging-construction',copyZone:'top',techniques:['kraft fibre and folded-edge definition','controlled red-print color fidelity','directional studio product light'],concepts:['confident packaging hero on a clean industrial work surface','precise construction portrait with dimensional depth','credible dispatch preparation with the real carton prominent'],constraints:['Keep the exact reference printing, panel joins, flute construction and closed/open state. Do not add ribbons, new brand slogans, contents or waterproof demonstrations. A kraft material alone does not prove water resistance. Avoid anonymous beige warehouses and distant conveyor-belt catalog photos.']},
 beauty:{id:'beauty-material',copyZone:'top',techniques:['controlled glass reflections','cosmetic texture macro','editorial still life'],concepts:['ingredient-inspired studio still life','texture and packaging close-up','credible daily-care setting'],constraints:['Do not invent ingredients, clinical results or change supplied packaging.']},
 bags:{id:'accessory-craft',copyZone:'top',techniques:['leather-grain macro','architectural product portrait','hardware edge light'],concepts:['sculptural studio portrait','craftsmanship close-up','natural carrying gesture'],constraints:['Preserve handle, seams, closures, logos and leather color from supplied references.','Keep body width, body height, gusset depth, handle rise, attachment spacing and closure size mutually consistent with the same reference bag. Distinguish body height from overall height including the handle; never invent an unspecified measurement. Use a perspective that communicates the silhouette without an exaggerated near side, elongated handle or stretched body. If a hand holds the handle, use plausible relative scale, contact and weight.']},
 jewelry:{id:'jewelry-light',copyZone:'bottom',techniques:['macro focus','facet and metal illumination','sculptural shadow'],concepts:['jewel as sculptural hero','precise setting detail','restrained wearing portrait'],constraints:['Preserve stone shape, setting and proportions; no extra prongs or fake sparkle.']},
 fashion:{id:'fashion-motion',copyZone:'left',techniques:['editorial lifestyle','tailoring detail','natural fabric movement'],concepts:['architectural walking editorial','fabric and cut portrait','credible everyday styling'],constraints:['Natural anatomy; preserve garment construction, color and print.']},
 electronics:{id:'appliance-precision',copyZone:'left',techniques:['industrial product portrait','credible use context','controlled metallic reflections'],concepts:['design-object studio campaign','realistic use in a refined interior','functional detail close-up'],constraints:['Do not invent functions, controls, technical performance or impossible mechanisms.']},
 travel:{id:'travel-experience',copyZone:'bottom',techniques:['cinematic landscape','human scale','atmospheric depth'],concepts:['destination panorama with human scale','immersive travel moment','local experience editorial'],constraints:['Use only supplied destinations and included experiences; avoid invented landmarks.']},
 lodging:{id:'hotel-architecture',copyZone:'left',techniques:['architectural photography','natural light and linen detail','hospitality editorial'],concepts:['room and view portrait','inviting architectural threshold','quiet hospitality detail'],constraints:['Do not invent facilities or imply a verified property absent from supplied evidence.']},
 insurance:{id:'insurance-everyday',copyZone:'top',techniques:['human documentary editorial','natural connection','calm financial brand composition'],concepts:['a meaningful everyday family moment','individual planning scene','thoughtful service conversation'],constraints:['No invented coverage, premiums, eligibility, guaranteed payouts or fear imagery.']},
 hospital:{id:'healthcare-listening',copyZone:'top',techniques:['credible consultation editorial','architectural daylight','natural human gestures'],concepts:['attentive consultation','provided clinic space','neutral healthcare service scene'],constraints:['No invented cures, medical credentials, outcomes, before-and-after photos or equipment.']},
 lease:{id:'mobility-silhouette',copyZone:'bottom',techniques:['automotive three-quarter portrait','sculpted-metal light','credible driving environment'],concepts:['vehicle hero in architectural setting','mobility in everyday life','vehicle detail portrait'],constraints:['Preserve supplied vehicle identity; no invented rates, deposits or contract terms.']},
 other:{id:'editorial-product',copyZone:'top',techniques:['editorial product portrait','material-specific lighting','natural use setting'],concepts:['distinct studio hero','detail-focused campaign','credible use editorial'],constraints:['Preserve product identity and all supplied facts.']},
};
export function artDirectionFor(category:string,ratio:string,notes=''):ArtDirection{
 const aliases:Record<string,string>={accessories:'bags',shoes:'fashion',rental:'lease',biotech:'hospital',boxes:'packaging',corrugated:'packaging',kraft:'packaging'};
 const base=directions[aliases[category]??category]??directions.other;
 // Customer layout requests take priority, but never execute arbitrary instructions.
 let copyZone=base.copyZone;
 if(/(?:문구|제목|헤드라인|headline|copy).{0,24}(?:하단|아래|bottom)/i.test(notes))copyZone='bottom';
 else if(/(?:문구|제목|헤드라인|headline|copy).{0,24}(?:상단|위쪽|top)/i.test(notes))copyZone='top';
 else if(/(?:문구|제목|헤드라인|headline|copy).{0,24}(?:왼쪽|좌측|left)/i.test(notes))copyZone='left';
 if(['16:9','1.91:1','3:2'].includes(ratio))copyZone='left';
 return {...base,copyZone,techniques:[...base.techniques],concepts:[...base.concepts],constraints:[...base.constraints]};
}
export function requestedCallToAction(note:string):string{
 // The goal "inquiry" alone never opts in. Negative CTA requests win.
 if(/(?:CTA|클릭|구매|문의|예약|행동.?유도).{0,25}(?:없이|빼|제외|삭제|넣지|안.?넣|no\b|omit|remove)|(?:no|without|omit|remove).{0,20}(?:CTA|call.to.action)/i.test(note))return '';
 const requested=/(?:CTA|행동.?유도|문의.?문구|구매.?문구|예약.?문구).{0,30}(?:넣|추가|포함|표시|요청)|(?:add|include|insert).{0,30}(?:CTA|call.to.action)/i.test(note);
 const concrete=note.match(/(?:구매하기|문의하기|예약하기|상담하기|지금 구매|지금 문의|지금 예약|shop now|book now|contact us|get in touch)/i);
 if(concrete&&/(?:넣|추가|포함|표시|add|include|insert)/i.test(note))return concrete[0];
 return requested?'requested':'';
}

