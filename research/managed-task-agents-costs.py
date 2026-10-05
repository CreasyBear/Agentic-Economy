#!/usr/bin/env python3
"""Planning arithmetic, not a vendor quote or a forecast. Python standard library only.

Run beside managed-task-agents-evidence.json. No network, credentials or writes.
Usage: python3 research/managed-task-agents-costs.py [--operating | --marketplace] [--json | --self-check]
"""

import argparse
import json
import math
from pathlib import Path


INPUT_PATH = Path(__file__).with_name("managed-task-agents-evidence.json")


def overage(used, included, rate):
    return max(0.0, used - included) * rate


def credited_bill(usage, monthly_commitment):
    # Commitment includes credits: never add the commitment to all metered usage.
    return max(usage, monthly_commitment)


def xero_plan(connections, tiers):
    for tier in tiers:
        if connections <= tier["connections"]:
            return tier
    return None


def e2b_plan(capacity, plans):
    for plan in plans:
        if capacity <= plan["concurrency"]:
            return plan
    return None


def lifecycle_compute(data):
    """Runtime-only microtask sensitivity, not full job economics or a live benchmark.

    Published pause latency does not establish billable pause duration. The
    low/high assumptions expose that uncertainty rather than treat it as free.
    Timeout case assumes no explicit pause/shortening and no snapshot backlog.
    """
    a, e = data["assumptions"], data["rates"]["e2b"]
    p = a["microtask_lifecycle"]
    second_rate = a["vcpus"] * e["vcpu_second"] + a["ram_gib"] * e["gib_second"]
    cases = [
        ("fresh_each_job", p["work_seconds"] + p["fresh_bootstrap_seconds"]),
        ("standby_explicit_pause_low", p["work_seconds"] + p["resume_seconds"] + p["memory_pause_billable_seconds_low"]),
        ("standby_explicit_pause_high", p["work_seconds"] + p["resume_seconds"] + p["memory_pause_billable_seconds_high"]),
        ("standby_wait_for_auto_timeout", max(p["work_seconds"] + p["resume_seconds"], e["auto_resume_timeout_floor_seconds"])),
    ]
    retries = a["short_job"]["attempt_multiplier"]
    return [
        {"case": name, "billable_seconds_per_attempt_assumed": seconds,
         "compute_usd_per_accepted_job": seconds * second_rate * retries,
         "compute_usd_per_3m_accepted_jobs": seconds * second_rate * retries * 3_000_000,
         "scope": "Runtime compute only; subscriptions, tokens, tools, control, human support and standby storage-policy changes excluded"}
        for name, seconds in cases
    ]


def calculate(customers, data, *, model="economy", support_rate=None, heavy=False):
    if not isinstance(customers, int) or customers <= 0:
        raise ValueError("customers must be a positive integer")
    rates, a = data["rates"], data["assumptions"]
    if model not in rates["models"]:
        raise ValueError("unknown model class")
    sr = a["support_job_fraction"] if support_rate is None else support_rate
    if not 0 <= sr <= 1:
        raise ValueError("support fraction must be between zero and one")
    profile = a["heavy_job"] if heavy else a["short_job"]
    jobs = customers * a["jobs_per_customer_per_month"]
    attempts = jobs * profile["attempt_multiplier"]
    seconds = a["days_per_month"] * 24 * 3600
    runtime = profile["work_seconds"] + a["bootstrap_seconds"]
    concurrency = attempts * runtime / seconds
    peak_factor = a["peak_to_average_factor"]
    capacity = math.ceil(concurrency * peak_factor / a["target_capacity_utilization"])
    creates_rps = attempts / seconds * peak_factor
    tools = attempts * a["connector_calls_per_attempt"]
    e2b, connector, control = rates["e2b"], rates["composio"], rates["convex"]
    ep = e2b_plan(capacity, e2b["pro_capacity_options"])
    xp = xero_plan(customers * a["xero_orgs_per_customer"], rates["xero"]["tiers"])
    # None means quote required. Public-plan floors are not silently substituted.
    unpriced = []
    if ep is None:
        unpriced.append("E2B capacity subscription above public Pro options")
    if creates_rps > e2b["pro_creates_per_second"]:
        unpriced.append("E2B creation-rate upgrade")
    if xp is None:
        unpriced.append("Xero Enterprise tier and egress allowance")
    cpu_rate = e2b["vcpu_second"] * a["vcpus"]
    memory_rate = e2b["gib_second"] * a["ram_gib"]
    model_rate = rates["models"][model]
    inference = attempts * (
        profile["input_tokens"] * model_rate["input_per_million"]
        + profile["output_tokens"] * model_rate["output_per_million"]
    ) / 1_000_000
    # Batched monthly credit funding; minimum purchase fee matters at low spend.
    router_fee = max(inference * rates["openrouter"]["standard_credit_fee_fraction"],
                     rates["openrouter"]["minimum_card_credit_fee_usd"])
    connector_usage = overage(tools, connector["own_oauth_free_calls"],
                              connector["own_oauth_call_rate"])
    connector_usage += tools * connector["zdr_call_addon"]
    connector_bill = credited_bill(connector_usage, connector["monthly_credit_commitment"])
    fx = a["aud_per_usd"]
    revenue = customers * a["price_aud_per_month_ex_gst"] / fx
    action_gibh = attempts * profile["control_action_seconds"] * a["control_action_gib"] / 3600
    # Decimal GB for storage/transfer. Retention approximates steady-state occupancy.
    stored_file_gb = jobs * a["file_mb_per_job"] / 1000 * a["file_retention_days"] / a["days_per_month"]
    stored_db_gb = jobs * a["metadata_kb_per_job"] / 1_000_000 * a["metadata_retention_days"] / a["days_per_month"]
    db_io_gb = attempts * a["db_io_mb_per_attempt"] / 1000
    data_egress_gb = attempts * a["control_egress_mb_per_attempt"] / 1000
    units = {
        "function_calls": attempts * a["control_calls_per_attempt"],
        "action_gibh": action_gibh, "db_storage_gb": stored_db_gb,
        "file_storage_gb": stored_file_gb, "db_io_gb": db_io_gb,
        "data_egress_gb": data_egress_gb,
    }
    resource_bill = 0.0
    for metric, used in units.items():
        entry = control[metric]
        resource_bill += overage(used, entry["included"], entry["overage_rate"])
    # Region factor is an assumption; public quoted resource table is US East 1.0x.
    control_bill = control["developer_seat_month"] * a["developer_seats"]
    control_bill += resource_bill * a["control_region_price_factor"]
    xero_egress_gb = attempts * a["xero_egress_kb_per_attempt"] / 1_000_000
    xero_bill = None if xp is None else (
        xp["monthly_aud"] + overage(xero_egress_gb, xp["egress_gb"],
                                    rates["xero"]["egress_aud_per_gb"])
    ) / fx
    support_minutes = profile["support_minutes"]
    support = jobs * sr * support_minutes / 60 * a["support_hourly_usd"]
    stripe = rates["stripe_au"]
    costs = {
        "e2b_compute": attempts * runtime * (cpu_rate + memory_rate),
        "e2b_capacity_subscription": None if ep is None else e2b["pro_base_month"] + ep["addon_month"],
        "inference_and_credit_fee": inference + router_fee,
        "composio_own_oauth_and_zdr": connector_bill,
        "control_and_file_storage": control_bill,
        "xero_app_and_egress": xero_bill,
        "auth_web_observability_reserve": a["platform_fixed_usd"] + customers * a["platform_per_customer_usd"],
        "stripe_payments_and_billing": revenue * (stripe["domestic_card_fraction"] + stripe["billing_fraction"]) + customers * stripe["domestic_card_fixed_aud"] / fx,
        "human_exception_handling": support,
        "remedy_reserve": revenue * a["remedy_revenue_fraction"],
    }
    # No inference that an unpriced component costs zero.
    subtotal = sum(v for v in costs.values() if v is not None)
    complete = not unpriced
    nango = rates["nango"]
    nango_usage = customers * a["connections_per_customer"] * nango["connection_month"]
    nango_usage += tools * a["nango_seconds_per_call"] / 3600 * nango["compute_hour"]
    nango_usage += jobs * a["nango_egress_mb_per_job"] / 1000 * nango["egress_gb"]
    # Conservative: no assumed PAYG free allowances; not added to default bill.
    nango_alternative = credited_bill(nango_usage, nango["monthly_credit_commitment"])
    support_hours = jobs * sr * support_minutes / 60
    return {
        "customers": customers, "jobs": jobs, "attempts": attempts,
        "model": model, "profile": "heavy" if heavy else "short",
        "support_fraction": sr, "runtime_seconds_per_attempt": runtime,
        "revenue_usd": revenue, "costs_usd": costs,
        "priced_cost_subtotal_usd": subtotal, "fully_priced": complete,
        "unpriced_components": unpriced,
        "contribution_margin_fraction": (revenue - subtotal) / revenue if complete else None,
        "priced_cost_per_job_usd": subtotal / jobs,
        "cloud_and_platform_cost_per_job_usd": sum(v for k, v in costs.items()
            if v is not None and k not in {"human_exception_handling", "stripe_payments_and_billing", "remedy_reserve"}) / jobs,
        "support_hours": support_hours,
        "support_fte_at_160_hours": support_hours / 160,
        "max_support_fraction_for_70pct_contribution": max(0.0,
            (revenue * 0.30 - (subtotal - support))
            / (jobs * support_minutes / 60 * a["support_hourly_usd"])) if complete else None,
        "mean_running_sandboxes": concurrency, "required_sandbox_capacity": capacity,
        "peak_creates_per_second": creates_rps,
        "peak_tool_calls_per_minute": tools / seconds * peak_factor * 60,
        "mean_active_control_actions": attempts * profile["control_action_seconds"] / seconds,
        "control_metered_units": units,
        "nango_alternative_month_usd": nango_alternative,
    }


def service_economics(service, data, *, marketplace=False, refund_fraction=None):
    """Expected AUD contribution per booked Call, not an exact-money ledger.

    Requires nonnegative budgets/prices, valid probability fractions and a fixed
    Seller model. Ensures GMV, Provider contribution and platform revenue remain
    distinct. Refunds return the platform fee but retain original processing and
    spent delivery costs. Invalid input raises; no missing cost becomes zero.
    """
    a, stripe = data["marketplace_assumptions"], data["rates"]["stripe_au"]
    refund = a["refund_fraction"] if refund_fraction is None else refund_fraction
    take = a["marketplace_take_fraction"] if marketplace else a["own_customer_take_fraction"]
    for fraction in (refund, take, a["platform_exception_fraction"],
                     a["dispute_fee_frequency"], service["provider_exception_fraction"]):
        if not math.isfinite(fraction) or not 0 <= fraction <= 1:
            raise ValueError("fractions must be finite and between zero and one")
    for key in ("price_aud_inc_gst", "provider_license_aud", "provider_review_minutes",
                "provider_exception_minutes", "execution_aud", "active_seconds"):
        if not math.isfinite(service[key]) or service[key] < 0:
            raise ValueError("service budgets must be finite and nonnegative")
    for key in ("sale_gst_fraction", "provider_hourly_aud", "platform_hourly_aud",
                "platform_exception_minutes"):
        if not math.isfinite(a[key]) or a[key] < 0:
            raise ValueError("rates and budgets must be finite and nonnegative")
    gross = service["price_aud_inc_gst"]
    sales = gross / (1 + a["sale_gst_fraction"])
    retained_sales = sales * (1 - refund)
    fee = sales * take * (1 - refund)
    card = gross * stripe["domestic_card_fraction"] + stripe["domestic_card_fixed_aud"]
    review = service["provider_review_minutes"] / 60 * a["provider_hourly_aud"]
    rework = service["provider_exception_fraction"] * service["provider_exception_minutes"] / 60 * a["provider_hourly_aud"]
    disputes = a["dispute_fee_frequency"] * stripe["dispute_received_aud"]
    support = a["platform_exception_fraction"] * a["platform_exception_minutes"] / 60 * a["platform_hourly_aud"]
    return {
        "service": service["name"], "channel": "marketplace" if marketplace else "own customers",
        "booked_gmv_aud_inc_gst": gross, "retained_sales_aud_ex_gst": retained_sales,
        "platform_fee_revenue_aud_ex_gst": fee, "processor_cash_cost_aud": card,
        "provider_review_and_rework_aud": review + rework,
        "provider_contribution_aud": retained_sales - fee - card - review - rework - service["provider_license_aud"] - disputes,
        "platform_variable_cost_aud": service["execution_aud"] + support,
        "platform_call_contribution_aud": fee - service["execution_aud"] - support,
    }


def marketplace_economics(data):
    a = data["marketplace_assumptions"]
    for key in ("platform_plan_aud_ex_gst", "provider_monthly_support_aud",
                "platform_fixed_allocation_per_provider_aud", "provider_onboarding_hours",
                "onboarding_hourly_aud", "provider_cac_aud"):
        if not math.isfinite(a[key]) or a[key] < 0:
            raise ValueError("platform budgets must be finite and nonnegative")
    mix = a["marketplace_share"]
    if not 0 <= mix <= 1 or not math.isclose(sum(s["mix_fraction"] for s in a["services"]), 1):
        raise ValueError("channel and service mix must be valid")
    if any(s["mix_fraction"] < 0 for s in a["services"]):
        raise ValueError("service mix cannot be negative")
    services = [service_economics(s, data, marketplace=m) for s in a["services"] for m in (False, True)]
    blended = {}
    for key in ("booked_gmv_aud_inc_gst", "platform_fee_revenue_aud_ex_gst", "platform_call_contribution_aud"):
        blended[key] = sum(s["mix_fraction"] * (
            (1 - mix) * service_economics(s, data)[key] + mix * service_economics(s, data, marketplace=True)[key]
        ) for s in a["services"])
    stripe = data["rates"]["stripe_au"]
    plan = a["platform_plan_aud_ex_gst"]
    plan_collection = plan * (1 + a["sale_gst_fraction"]) * (stripe["domestic_card_fraction"] + stripe["billing_fraction"]) + stripe["domestic_card_fixed_aud"]
    activation = a["provider_onboarding_hours"] * a["onboarding_hourly_aud"] + a["provider_cac_aud"]
    cohorts = []
    for c in a["cohorts"]:
        n, j = c["providers"], c["jobs_per_provider"]
        if not isinstance(n, int) or n <= 0 or not isinstance(j, int) or j <= 0 or not math.isfinite(c["company_fixed_month_aud"]) or c["company_fixed_month_aud"] < 0:
            raise ValueError("cohorts need positive counts and nonnegative company cost")
        per_provider = plan - plan_collection - a["provider_monthly_support_aud"] - a["platform_fixed_allocation_per_provider_aud"] + j * blended["platform_call_contribution_aud"]
        jobs = n * j
        cohorts.append({
            "providers": n, "calls_month": jobs,
            "booked_gmv_aud_inc_gst": jobs * blended["booked_gmv_aud_inc_gst"],
            "platform_revenue_aud_ex_gst": n * plan + jobs * blended["platform_fee_revenue_aud_ex_gst"],
            "platform_contribution_before_company_cost_aud": n * per_provider,
            "illustrative_company_fixed_cost_aud": c["company_fixed_month_aud"],
            "platform_contribution_after_company_cost_aud": n * per_provider - c["company_fixed_month_aud"],
            "first_month_activation_and_cac_aud": n * activation,
            "first_month_after_activation_aud": n * per_provider - c["company_fixed_month_aud"] - n * activation,
            "activation_payback_months_before_company_cost": activation / per_provider if per_provider > 0 else None,
            "providers_to_cover_company_cost": math.ceil(c["company_fixed_month_aud"] / per_provider) if per_provider > 0 else None,
            "provider_review_hours_month": jobs * sum(s["mix_fraction"] * s["provider_review_minutes"] for s in a["services"]) / 60,
            "average_active_executions": jobs * sum(s["mix_fraction"] * s["active_seconds"] for s in a["services"]) / (30 * 86400),
        })
    return {"currency": "AUD", "status": a["classification"], "services": services, "cohorts": cohorts,
            "blended_per_call": blended, "cost_scope": a["cost_scope"]}


def operating_economics(data, *, mode="hosted", market_share=0, payment_method="card"):
    """Monthly launch hypothesis; equal-volume Provider counterfactual.

    Requires finite nonnegative budgets/counts, valid fractions, an existing
    execution mode and at least one initial purchase per acquired buyer.
    Ensures monthly Provider profit/benefit includes its plan and labor against
    its mode-specific status quo; market CAC follows retained purchases in a
    steady-state relationship, with no invented first-month buyer cash timing.
    Invariant: hosting, distribution, GMV, Seller revenue and platform revenue
    stay distinct; refund/meter credits do not erase already-spent delivery.
    On violation: ValueError with the affected input; no writes or defaults
    converting an unknown rate to zero. Arithmetic is not an exact-money ledger.
    """
    a, stripe = data["operating_assumptions"], data["rates"]["stripe_au"]
    if mode not in a["modes"]:
        raise ValueError("unknown execution mode")
    if payment_method not in ("card", "payto", "provider_invoice"):
        raise ValueError("unknown buyer payment method")
    if payment_method == "provider_invoice" and market_share:
        raise ValueError("Provider invoice sensitivity is restricted to existing private clients")
    if mode == "provider_endpoint" and market_share != 1:
        raise ValueError("free endpoint publication models only market-originated Calls")
    profile, service = a["modes"][mode], a["reference_service"]
    for name, value in [("market_share", market_share)] + [
        (key, a[key]) for key in (
            "direct_distribution_take_fraction", "market_first_take_fraction",
            "market_repeat_take_fraction", "buyer_repeat_retention_fraction",
            "refund_fraction", "meter_credit_fraction", "dispute_fee_frequency", "provider_invoice_bad_debt_fraction",
            "platform_exception_fraction",
            "provider_churn_month_fraction", "net_provider_growth_month_fraction"
        )
    ] + [(key, service[key]) for key in ("provider_exception_fraction", "baseline_refund_fraction")] + [("platform_make_good_fraction", profile["platform_make_good_fraction"])]:
        if not math.isfinite(value) or not 0 <= value <= 1:
            raise ValueError(f"{name} must be a finite fraction in [0, 1]")
    for group in (a, *a["modes"].values(), service, stripe):
        for key, value in group.items():
            if isinstance(value, (int, float)) and (not math.isfinite(value) or value < 0):
                raise ValueError(f"{key} must be finite and nonnegative")
    if a["buyer_purchases_per_relationship"] < 1:
        raise ValueError("buyer_purchases_per_relationship must include the initial purchase")
    retained_calls = 1 + (a["buyer_purchases_per_relationship"] - 1) * a["buyer_repeat_retention_fraction"]
    market_take = (a["market_first_take_fraction"] + (retained_calls - 1) * a["market_repeat_take_fraction"]) / retained_calls
    take = (1 - market_share) * a["direct_distribution_take_fraction"] + market_share * market_take
    price = service["price_aud_inc_gst"]
    sales = price / (1 + a["sale_gst_fraction"])
    retained_sales = sales * (1 - a["refund_fraction"])
    if payment_method == "provider_invoice":
        retained_sales *= 1 - a["provider_invoice_bad_debt_fraction"]
    commission = retained_sales * take
    if payment_method == "card":
        processor = price * stripe["domestic_card_fraction"] + stripe["domestic_card_fixed_aud"]
    elif payment_method == "payto":
        processor = min(price * stripe["payto_fraction"] + stripe["payto_fixed_aud"], stripe["payto_cap_aud"])
    else:
        processor = service["baseline_payment_cost_aud_per_call"]
    labor = (service["provider_preparation_minutes"] + service["provider_review_minutes"]
             + service["provider_exception_fraction"] * service["provider_exception_minutes"]) / 60 * service["provider_hourly_aud"]
    baseline_labor = (profile["baseline_total_minutes"] + service["baseline_payment_admin_minutes_per_call"]) / 60 * service["provider_hourly_aud"]
    disputes = a["dispute_fee_frequency"] * stripe["dispute_received_aud"]
    meter = profile["meter_aud_ex_gst_per_admitted_call"] * (1 - a["meter_credit_fraction"])
    # External endpoint is not free: conservatively attribute its execution to
    # the Provider, rather than charging AE hosted execution to both modes.
    external_execution = 0 if mode == "hosted" else a["modes"]["hosted"]["execution_cost_aud_per_call"]
    provider_call = retained_sales - commission - processor - labor - service["provider_license_aud"] - disputes - meter - external_execution
    baseline_call = (sales * (1 - service["baseline_refund_fraction"]) - service["baseline_payment_cost_aud_per_call"]
                     - baseline_labor - service["provider_license_aud"] - disputes - profile["baseline_execution_aud_per_call"])
    admin = service["provider_monthly_admin_minutes"] / 60 * service["provider_hourly_aud"]
    provider_setup = service["provider_onboarding_minutes"] / 60 * service["provider_hourly_aud"]
    support = a["platform_exception_fraction"] * a["platform_exception_minutes"] / 60 * a["platform_hourly_aud"]
    make_good = price * profile["platform_make_good_fraction"]
    activation = profile["provider_cac_aud"] + profile["platform_onboarding_minutes"] / 60 * a["platform_onboarding_hourly_aud"]
    replacement = activation * a["provider_churn_month_fraction"]
    rows = []
    for c in a["cohorts"]:
        n, jobs, company = c["providers"], c["calls_per_provider_month"], c["company_fixed_month_aud"]
        if isinstance(n, bool) or isinstance(jobs, bool) or not isinstance(n, int) or not isinstance(jobs, int) or n <= 0 or jobs <= 0:
            raise ValueError("cohorts require positive integer Provider and Call counts")
        if not math.isfinite(company) or company < 0:
            raise ValueError("company_fixed_month_aud must be finite and nonnegative")
        plan = profile["plan_aud_ex_gst"]
        b2b_bill = plan + jobs * meter
        collection = (b2b_bill * (1 + a["sale_gst_fraction"]) * (stripe["domestic_card_fraction"] + stripe["billing_fraction"]) + stripe["domestic_card_fixed_aud"]) if b2b_bill else 0
        acquired_buyers = jobs * market_share / retained_calls
        buyer_acquisition = acquired_buyers * a["buyer_cac_aud"]
        platform_revenue = b2b_bill + jobs * commission
        per_provider_before_replacement = (platform_revenue - collection - jobs * (profile["execution_cost_aud_per_call"] + support + make_good)
            - profile["platform_support_aud_per_provider_month"] - profile["platform_fixed_allocation_aud_per_provider_month"] - buyer_acquisition)
        per_provider = per_provider_before_replacement - replacement
        provider_month = jobs * provider_call - plan - admin
        baseline_month = jobs * baseline_call
        steady = n * per_provider - company
        growth_cash = n * a["net_provider_growth_month_fraction"] * activation
        rows.append({
            "providers": n, "calls_per_provider_month": jobs, "calls_month": n * jobs,
            "booked_gmv_aud_inc_gst": n * jobs * price,
            "platform_revenue_aud_ex_gst": n * platform_revenue,
            "platform_contribution_after_company_and_replacement_aud": steady,
            "platform_steady_contribution_after_net_growth_acquisition_aud": steady - growth_cash,
            # Lifetime-normalized market purchases have no buyer cash calendar.
            "all_new_first_month_aud": n * per_provider_before_replacement - company - n * activation if market_share == 0 else None,
            "providers_to_cover_company_cost": math.ceil(company / per_provider) if per_provider > 0 else None,
            "activation_payback_months_before_company_and_replacement": activation / per_provider_before_replacement if per_provider_before_replacement > 0 else None,
            "provider_monthly_profit_after_plan_and_labor_aud": provider_month,
            "provider_gain_same_volume_aud": provider_month - baseline_month,
            "provider_first_month_gain_after_setup_aud": provider_month - baseline_month - provider_setup,
            "provider_human_hours_month": (jobs * (service["provider_preparation_minutes"] + service["provider_review_minutes"]
                + service["provider_exception_fraction"] * service["provider_exception_minutes"])
                + service["provider_monthly_admin_minutes"]) / 60,
            "platform_buyer_acquisition_aud": n * buyer_acquisition,
            "platform_replacement_acquisition_aud": n * replacement,
            "platform_net_growth_acquisition_aud": growth_cash,
            "platform_make_good_reserve_aud": n * jobs * make_good,
        })
    improvement = provider_call - baseline_call
    return {
        "currency": a["currency"], "status": a["classification"], "mode": mode, "buyer_payment_method": payment_method,
        "period_basis": "steady-state lifetime-normalized marketplace relationships; first-month buyer cash unspecified" if market_share else "monthly direct operating contribution; Provider invoice collection timing unspecified" if payment_method == "provider_invoice" else "monthly direct operating cohort",
        "market_share": market_share, "retained_calls_per_acquired_buyer": retained_calls,
        "blended_marketplace_take_fraction": market_take,
        "provider_calls_to_cover_incremental_plan_and_admin": math.ceil((profile["plan_aud_ex_gst"] + admin) / improvement) if improvement > 0 else None,
        "cohorts": rows, "cost_scope": a["cost_scope"],
    }


def self_check(data):
    assert overage(20, 100, 0.5) == 0
    assert credited_bill(10, 29) == 29 and credited_bill(100, 29) == 100
    xt = data["rates"]["xero"]["tiers"]
    assert xero_plan(50, xt)["monthly_aud"] == 35
    assert xero_plan(51, xt)["monthly_aud"] == 245
    assert xero_plan(1001, xt)["monthly_aud"] == 1445
    assert xero_plan(10001, xt) is None
    et = data["rates"]["e2b"]["pro_capacity_options"]
    assert e2b_plan(100, et)["addon_month"] == 0
    assert e2b_plan(101, et)["addon_month"] == 500
    assert e2b_plan(1101, et) is None
    a, b, c = [calculate(n, data) for n in (100, 1000, 10000)]
    assert a["jobs"] == 30000 and a["fully_priced"] and b["fully_priced"]
    assert not c["fully_priced"] and c["contribution_margin_fraction"] is None
    assert math.isclose(b["mean_running_sandboxes"], 10 * a["mean_running_sandboxes"])
    assert math.isclose(b["costs_usd"]["e2b_compute"], 10 * a["costs_usd"]["e2b_compute"])
    exact_compute = 33000 * 125 * (2 * 0.000014 + 4 * 0.0000045)
    assert math.isclose(a["costs_usd"]["e2b_compute"], exact_compute)
    assert 0.001 < b["max_support_fraction_for_70pct_contribution"] < 0.002
    assert calculate(1000, data, model="premium")["priced_cost_subtotal_usd"] > b["priced_cost_subtotal_usd"]
    assert calculate(1000, data, support_rate=0.05)["priced_cost_subtotal_usd"] > b["revenue_usd"]
    assert calculate(1000, data, heavy=True, model="premium", support_rate=0.05)["priced_cost_per_job_usd"] > b["priced_cost_per_job_usd"]
    assert all(v is None or v >= 0 for v in c["costs_usd"].values())
    ids = {s["id"] for s in data["sources"]}
    for rate in data["rates"].values():
        if "source_id" in rate:
            assert rate["source_id"] in ids
    for rate in data["rates"]["models"].values():
        assert rate["source_id"] in ids
    assert len(ids) == len(data["sources"])
    life = lifecycle_compute(data)
    assert life[0]["billable_seconds_per_attempt_assumed"] == 10
    assert life[1]["billable_seconds_per_attempt_assumed"] == 6
    assert life[2]["billable_seconds_per_attempt_assumed"] == 22
    assert life[3]["billable_seconds_per_attempt_assumed"] == 300
    assert math.isclose(life[3]["compute_usd_per_3m_accepted_jobs"], 45540)
    assert life[1]["compute_usd_per_accepted_job"] < life[0]["compute_usd_per_accepted_job"] < life[2]["compute_usd_per_accepted_job"]
    assert all(s in ids for s in data["rates"]["e2b"]["lifecycle_source_ids"])
    market = marketplace_economics(data)
    lookup = data["marketplace_assumptions"]["services"][0]
    own = service_economics(lookup, data, refund_fraction=0)
    intro = service_economics(lookup, data, marketplace=True, refund_fraction=0)
    refunded = service_economics(lookup, data, marketplace=True, refund_fraction=1)
    assert own["provider_contribution_aud"] > intro["provider_contribution_aud"]
    assert own["platform_fee_revenue_aud_ex_gst"] < intro["platform_fee_revenue_aud_ex_gst"]
    assert refunded["platform_fee_revenue_aud_ex_gst"] == 0
    assert refunded["processor_cash_cost_aud"] == intro["processor_cash_cost_aud"]
    assert refunded["provider_contribution_aud"] < 0 and refunded["platform_call_contribution_aud"] < 0
    tiny = service_economics(data["marketplace_assumptions"]["services"][2], data, marketplace=True)
    assert tiny["platform_call_contribution_aud"] < 0  # fixed costs defeat a tiny ticket
    assert market["cohorts"][0]["platform_revenue_aud_ex_gst"] < market["cohorts"][0]["booked_gmv_aud_inc_gst"]
    assert all(c["first_month_after_activation_aud"] < c["platform_contribution_after_company_cost_aud"] for c in market["cohorts"])
    assert math.isclose(intro["platform_fee_revenue_aud_ex_gst"], 29 / 1.1 * 0.15)
    report = data["marketplace_assumptions"]["services"][1]
    slower_review = dict(report, provider_review_minutes=60)
    standard = service_economics(report, data, marketplace=True)
    slower = service_economics(slower_review, data, marketplace=True)
    assert math.isclose(standard["provider_contribution_aud"] - slower["provider_contribution_aud"], 60)
    assert slower["platform_call_contribution_aud"] == standard["platform_call_contribution_aud"]
    for invalid in (-0.01, 1.01, float("nan")):
        try:
            service_economics(lookup, data, refund_fraction=invalid)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid probability accepted")
    # Observable operating guarantees: direct sales fund no buyer acquisition;
    # fewer retained purchases cost more; slow/no time savings fail the value
    # test even while the Seller remains profitable. No paid systems involved.
    from copy import deepcopy
    direct = operating_economics(data)
    assert math.isclose(direct["cohorts"][0]["provider_gain_same_volume_aud"], 164.95)
    assert direct["provider_calls_to_cover_incremental_plan_and_admin"] == 6
    payto = operating_economics(data, payment_method="payto")
    assert math.isclose(payto["cohorts"][0]["provider_gain_same_volume_aud"], 301.25)
    invoiced = operating_economics(data, payment_method="provider_invoice")
    assert math.isclose(invoiced["cohorts"][0]["provider_gain_same_volume_aud"], 292.15)
    unpaid_invoices = deepcopy(data)
    unpaid_invoices["operating_assumptions"]["provider_invoice_bad_debt_fraction"] = 1
    assert operating_economics(unpaid_invoices, payment_method="provider_invoice")["cohorts"][0]["provider_monthly_profit_after_plan_and_labor_aud"] < 0
    paid_by_card_already = deepcopy(data)
    paid_by_card_already["operating_assumptions"]["reference_service"]["baseline_payment_cost_aud_per_call"] = 17.13
    assert math.isclose(operating_economics(paid_by_card_already)["cohorts"][0]["provider_gain_same_volume_aud"], 336.25)
    assert all(c["platform_buyer_acquisition_aud"] == 0 for c in direct["cohorts"])
    acquired = operating_economics(data, market_share=.25)
    assert acquired["cohorts"][0]["platform_buyer_acquisition_aud"] > 0
    assert acquired["cohorts"][0]["all_new_first_month_aud"] is None
    unretained = deepcopy(data)
    unretained["operating_assumptions"]["buyer_repeat_retention_fraction"] = 0
    one_off = operating_economics(unretained, market_share=.25)
    assert one_off["retained_calls_per_acquired_buyer"] == 1
    assert one_off["cohorts"][0]["platform_buyer_acquisition_aud"] > acquired["cohorts"][0]["platform_buyer_acquisition_aud"]
    assert acquired["cohorts"][0]["provider_monthly_profit_after_plan_and_labor_aud"] < direct["cohorts"][0]["provider_monthly_profit_after_plan_and_labor_aud"]
    slow = deepcopy(data)
    slow["operating_assumptions"]["reference_service"]["provider_review_minutes"] = 120
    assert operating_economics(slow)["cohorts"][0]["provider_gain_same_volume_aud"] < 0
    all_refunded = deepcopy(data)
    all_refunded["operating_assumptions"]["refund_fraction"] = 1
    assert operating_economics(all_refunded)["cohorts"][0]["provider_monthly_profit_after_plan_and_labor_aud"] < 0
    endpoint = operating_economics(data, mode="provider_endpoint", market_share=1)
    # Existing endpoint automation is not AE's saving. This deliberately shows
    # a negative direct benefit until separate records/control value is measured.
    assert endpoint["cohorts"][0]["provider_gain_same_volume_aud"] < 0
    assert endpoint["cohorts"][0]["provider_monthly_profit_after_plan_and_labor_aud"] > 0
    unpaid = deepcopy(data)
    unpaid["operating_assumptions"]["reference_service"]["provider_hourly_aud"] = 0
    assert operating_economics(unpaid)["cohorts"][0]["provider_human_hours_month"] == direct["cohorts"][0]["provider_human_hours_month"]
    assert math.isclose(direct["cohorts"][0]["provider_human_hours_month"], 13.5)
    for invalid_mode, invalid_share in (("missing", 0), ("hosted", 1.1), ("hosted", float("nan")), ("provider_endpoint", 0)):
        try:
            operating_economics(data, mode=invalid_mode, market_share=invalid_share)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid mode/channel accepted")
    for c in direct["cohorts"]:
        assert c["platform_steady_contribution_after_net_growth_acquisition_aud"] < c["platform_contribution_after_company_and_replacement_aud"]
        assert c["all_new_first_month_aud"] < c["platform_contribution_after_company_and_replacement_aud"]
    for key, invalid in (("buyer_repeat_retention_fraction", float("nan")), ("buyer_purchases_per_relationship", 0), ("platform_onboarding_hourly_aud", -1)):
        bad = deepcopy(data)
        bad["operating_assumptions"][key] = invalid
        try:
            operating_economics(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid operating budget accepted")
    assert data["operating_assumptions"]["buyer_repeat_retention_fraction"] == .6
    print("PASS: legacy meters; GMV/revenue; monthly Provider benefit; direct/buyer CAC; repeat retention; refund cost retention; churn/growth cash; invalid inputs")


def markdown(rows, title):
    print("\n" + title + "\n")
    print("| Customers | Jobs/month | Priced cost USD/month | Cost/job USD | Contribution margin | Required concurrent sandboxes | Peak creates/s |")
    print("| ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for r in rows:
        prefix = "subtotal " if not r["fully_priced"] else ""
        margin = "quote needed" if r["contribution_margin_fraction"] is None else f'{r["contribution_margin_fraction"]:.1%}'
        print(f'| {r["customers"]:,} | {r["jobs"]:,} | {prefix}{r["priced_cost_subtotal_usd"]:,.2f} | {prefix}{r["priced_cost_per_job_usd"]:.4f} | {margin} | {r["required_sandbox_capacity"]:,} | {r["peak_creates_per_second"]:.2f} |')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--json", action="store_true")
    p.add_argument("--self-check", action="store_true")
    models = p.add_mutually_exclusive_group()
    models.add_argument("--marketplace", action="store_true", help="Superseded percentage-fee sensitivity retained for comparison")
    models.add_argument("--operating", action="store_true", help="Selected operating model, Provider monthly benefit and separate distribution/hosting")
    args = p.parse_args()
    data = json.loads(INPUT_PATH.read_text())
    if args.self_check:
        self_check(data)
        return
    if args.operating:
        rows = [operating_economics(data, market_share=share) for share in (0, .25)]
        rows.append(operating_economics(data, mode="provider_endpoint", market_share=1))
        rows.append(operating_economics(data, payment_method="payto"))
        rows.append(operating_economics(data, payment_method="provider_invoice"))
        if args.json:
            print(json.dumps(rows, indent=2))
            return
        print("AUD owner-selected hypotheses; direct-only initial case, marketplace sensitivity separate. Not a forecast.")
        print("| Mode / buyer payment / market Call share | Providers | Calls/month | Platform revenue | After company + replacement CAC | After net growth acquisition | Provider monthly gain vs its existing delivery |")
        print("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
        for r in rows:
            for c in r["cohorts"]:
                print(f'| {r["mode"]}/{r["buyer_payment_method"]} / {r["market_share"]:.0%} | {c["providers"]} | {c["calls_month"]:,} | {c["platform_revenue_aud_ex_gst"]:,.2f} | {c["platform_contribution_after_company_and_replacement_aud"]:,.2f} | {c["platform_steady_contribution_after_net_growth_acquisition_aud"]:,.2f} | {c["provider_gain_same_volume_aud"]:,.2f} |')
        print("\n" + rows[0]["cost_scope"])
        return
    if args.marketplace:
        market = marketplace_economics(data)
        if args.json:
            print(json.dumps(market, indent=2))
            return
        print("Superseded percentage-fee AUD sensitivity; use --operating for selected launch hypotheses. Not a forecast.")
        print("\n| Service / channel | Gross price | Provider contribution/Call | Platform fee revenue/Call | Platform contribution/Call |")
        print("| --- | ---: | ---: | ---: | ---: |")
        for r in market["services"]:
            print(f'| {r["service"]} / {r["channel"]} | {r["booked_gmv_aud_inc_gst"]:.2f} | {r["provider_contribution_aud"]:.2f} | {r["platform_fee_revenue_aud_ex_gst"]:.2f} | {r["platform_call_contribution_aud"]:.2f} |')
        print("\n| Providers | Calls/month | GMV incl GST | Platform revenue ex GST | Contribution after company cost | First month incl activation/CAC | Break-even Providers |")
        print("| ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
        for r in market["cohorts"]:
            print(f'| {r["providers"]} | {r["calls_month"]:,} | {r["booked_gmv_aud_inc_gst"]:,.2f} | {r["platform_revenue_aud_ex_gst"]:,.2f} | {r["platform_contribution_after_company_cost_aud"]:,.2f} | {r["first_month_after_activation_aud"]:,.2f} | {r["providers_to_cover_company_cost"]} |')
        print("\n" + market["cost_scope"])
        return
    rows = [calculate(n, data) for n in (100, 1000, 10000)]
    sensitivity = [calculate(1000, data, support_rate=s) for s in (0.001, 0.01, 0.05)]
    premium = calculate(1000, data, model="premium")
    heavy = calculate(1000, data, model="premium", support_rate=0.05, heavy=True)
    if args.json:
        print(json.dumps({"baseline": rows, "support_sensitivity": sensitivity,
                          "premium_short": premium, "heavy": heavy,
                          "microtask_lifecycle": lifecycle_compute(data)}, indent=2))
        return
    print("Historical workflow-subscription model in USD; use --marketplace for the new service-market hypothesis. Not a forecast.")
    markdown(rows, "Short jobs, economy model, 1% intervention")
    print("\n1,000-customer monthly components (USD):")
    for k, v in rows[1]["costs_usd"].items():
        print(f"  {k}: {'quote needed' if v is None else f'{v:,.2f}'}")
    print("\nIntervention sensitivity at 1,000 customers:")
    for r in sensitivity:
        print(f'  {r["support_fraction"]:.1%}: ${r["priced_cost_per_job_usd"]:.4f}/job; {r["contribution_margin_fraction"]:.1%} contribution; {r["support_hours"]:,.0f} support hours')
    print(f'Premium short: ${premium["priced_cost_per_job_usd"]:.4f}/job; {premium["contribution_margin_fraction"]:.1%} contribution')
    print(f'Heavy premium priced subtotal: ${heavy["priced_cost_per_job_usd"]:.4f}/job; fully priced={heavy["fully_priced"]}; missing={heavy["unpriced_components"]}')
    print(f'Nango alternative connector subtotal at 1,000 customers: ${rows[1]["nango_alternative_month_usd"]:,.2f}; not included in baseline')
    print(f'70% contribution target at 1,000 customers requires intervention below {rows[1]["max_support_fraction_for_70pct_contribution"]:.3%} at the assumed 5 minutes and $60/hour')
    print("\n5-second microtask lifecycle sensitivity, runtime compute only:")
    for r in lifecycle_compute(data):
        print(f'  {r["case"]}: {r["billable_seconds_per_attempt_assumed"]} assumed billable seconds; ${r["compute_usd_per_accepted_job"]:.7f}/accepted job; ${r["compute_usd_per_3m_accepted_jobs"]:,.2f}/3M accepted jobs')
    print("Excludes engineering, sales/CAC, corporate overhead, initial OAuth/security reviews, insurance and unquoted enterprise terms.")


if __name__ == "__main__":
    main()
