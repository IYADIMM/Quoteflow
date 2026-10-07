export class EmailProvider { async send(_message){throw new Error('Email provider not configured.');} }
export class PdfProvider { async render(_immutableSnapshot){throw new Error('Server-side PDF provider not configured.');} }
export class BillingProvider { async createCheckout(_organization,_plan){throw new Error('Billing provider not configured.');} async verifyWebhook(_request){throw new Error('Billing provider not configured.');} }
