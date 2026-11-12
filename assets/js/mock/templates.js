window.ENR_MOCK_TEMPLATES = [
  {
    id: 'RESP-001',
    code: 'RESP-001',
    name_th: 'การแลกเปลี่ยนแก๊สบกพร่อง',
    name_en: 'Impaired gas exchange',
    category: 'Respiratory',
    keywords: ['hypoxia', 'desat', 'SpO2 ต่ำ', 'หายใจลำบาก', 'gas exchange'],
    version: '1.0',
    review_status: 'DRAFT',
    items: [
      { section_code: 'F', source_type: 'TCNP', tcnp_code: 'F0269', note_template: '' },
      { section_code: 'A_S', source_type: 'MANUAL', note_template: 'ผู้ป่วยบอกว่าเหนื่อย หายใจไม่อิ่ม/แน่นหน้าอก หรือมีอาการผิดปกติที่เกี่ยวข้อง' },
      { section_code: 'A_O', source_type: 'TCNP', tcnp_code: 'P1733', note_template: 'ประเมินลักษณะและแบบแผนการหายใจ อาการหอบเหนื่อย การใช้กล้ามเนื้อช่วยหายใจ และอาการแสดงผิดปกติ' },
      { section_code: 'A_O', source_type: 'TCNP', tcnp_code: 'P1396', note_template: 'วัด SpO₂ ___% และบันทึกค่าร่วมกับอาการทางคลินิก' },
      { section_code: 'G', source_type: 'MANUAL', note_template: 'ผู้ป่วยมีการแลกเปลี่ยนแก๊สเพียงพอ ค่า SpO₂ อยู่ในเป้าหมายตามแผนการรักษา และไม่มีอาการพร่องออกซิเจนเพิ่มขึ้น' },
      { section_code: 'I', source_type: 'TCNP', tcnp_code: 'P1397', note_template: 'ให้ออกซิเจนบำบัดตามแผนการรักษา พร้อมตรวจสอบวิธีให้และอัตราการไหลให้ถูกต้อง' },
      { section_code: 'I', source_type: 'TCNP', tcnp_code: 'P1648', note_template: 'ติดตามระดับออกซิเจนในเลือดด้วย pulse oximetry ตามอาการและความเหมาะสม' },
      { section_code: 'I', source_type: 'MANUAL', note_template: 'จัดท่าศีรษะสูง/ท่าที่ช่วยให้ทรวงอกขยายตัวดี และลดกิจกรรมที่เพิ่มการใช้ออกซิเจนตามความเหมาะสม' },
      { section_code: 'E', source_type: 'TCNP', tcnp_code: 'P1398', note_template: 'ประเมินการตอบสนองต่อการให้ออกซิเจนและอาการหลังการพยาบาล' },
      { section_code: 'E', source_type: 'MANUAL', note_template: 'หลังให้การพยาบาล SpO₂ ___% RR ___ ครั้ง/นาที อาการหอบเหนื่อย __________' }
    ]
  }
];
