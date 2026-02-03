import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from "class-validator";

const privateIpRegex = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^fc00:/,
  /^fe80:/,
  /^::1$/,
];

@ValidatorConstraint({ async: false })
export class IsPublicUrlConstraint implements ValidatorConstraintInterface {
  validate(url: string, args: ValidationArguments) {
    // If optional and not present, it's valid (should be handled by @IsOptional generic decorator if used,
    // but here we validate string)
    // Actually if the field is optional, class-validator skips validation if value is null/undefined usually,
    // but if it's passed as null, we should allow it or let @IsOptional handle it.
    // The validate method is called only if value is not undefined/null if @IsOptional is used?
    // Let's assume we validate the value if it exists.
    if (typeof url !== "string") return false;

    try {
      const parsedUrl = new URL(url);

      // 1. Check protocol is HTTPS
      if (parsedUrl.protocol !== "https:") {
        return false;
      }

      const hostname = parsedUrl.hostname;

      // 2. Check for localhost
      if (hostname === "localhost" || hostname.endsWith(".local")) {
        return false;
      }

      // 3. Check for private IPs
      // We check against regex if it looks like an IP
      for (const regex of privateIpRegex) {
        if (regex.test(hostname)) {
          return false;
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments) {
    return "Endpoint must be a valid public HTTPS URL and not point to private networks";
  }
}

export function IsPublicUrl(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsPublicUrlConstraint,
    });
  };
}
