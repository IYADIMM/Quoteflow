import { PrismaClient, Role, CatalogType, RFQStatus, QuoteStatus } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const email = process.env.DEMO_OWNER_EMAIL;
  const passwordHash = process.env.DEMO_OWNER_PASSWORD_HASH;
  if (!email || !passwordHash) throw new Error('Set DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD_HASH to seed an isolated demo tenant.');
  const user = await prisma.user.upsert({ where:{email}, update:{}, create:{email,passwordHash,emailVerifiedAt:new Date()} });
  const organization = await prisma.organization.upsert({where:{id:'quoteflow-demo-org'},update:{},create:{id:'quoteflow-demo-org',name:'Acme Commercial Supplies',reportingCurrency:'AED'}});
  await prisma.membership.upsert({where:{userId_organizationId:{userId:user.id,organizationId:organization.id}},update:{role:Role.OWNER},create:{userId:user.id,organizationId:organization.id,role:Role.OWNER}});
  await prisma.companySettings.upsert({where:{organizationId:organization.id},update:{},create:{organizationId:organization.id,data:{company:'Acme Commercial Supplies',currency:'AED',tax:5,payment:'30 days from invoice'},minMargin:20,quoteValidityDays:30}});
  const customers=[['horizon','Horizon Hospitality','Maya Haddad','maya@horizon.example'],['metro','Metro Retail Group','Omar Saeed','omar@metro.example'],['gulf','Gulf Interiors','Lina Rahman','lina@gulfinteriors.example']];
  for(const [id,companyName,contactName,emailAddress] of customers) await prisma.customer.upsert({where:{id},update:{},create:{id,organizationId:organization.id,companyName,contactName,email:emailAddress}});
  const products=[['AC-CH-104','Aero Task Chair',410,725],['AC-DS-220','Atlas Executive Desk',1280,2190],['AC-CH-118','Studio Visitor Chair',245,440],['SV-IN-010','On-site Installation',90,160]];
  for(const [sku,name,cost,sellingPrice] of products) await prisma.catalogItem.upsert({where:{organizationId_sku:{organizationId:organization.id,sku}},update:{},create:{organizationId:organization.id,sku,name,cost,sellingPrice,currency:'AED',type:sku.startsWith('SV-')?CatalogType.SERVICE:CatalogType.PRODUCT}});
  void RFQStatus; void QuoteStatus;
}
main().finally(()=>prisma.$disconnect());
